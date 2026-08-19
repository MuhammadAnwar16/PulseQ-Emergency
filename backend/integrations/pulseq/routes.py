"""REST endpoints consumed by PulseQ for Emergency Portal integration.

Mounted at ``/integrations/pulseq/`` — enabled when ``INTEGRATION_MODE=pulseq_connected``.

All endpoints verify HMAC signatures (except GET /sync which is a connectivity status endpoint).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app import db_models as m
from integrations.pulseq.auth import verify_pulseq_webhook
from integrations.pulseq.id_mapping import resolve_or_create_patient, resolve_doctor, get_pulseq_patient_id

logger = logging.getLogger("pulseq.emergency.integration.routes")

router = APIRouter(
    prefix="/integrations/pulseq",
    tags=["PulseQ Integration"],
    dependencies=[Depends(verify_pulseq_webhook)],
)


class InitialVitals(BaseModel):
    heart_rate: Optional[int] = None
    bp_systolic: Optional[int] = None
    bp_diastolic: Optional[int] = None
    spo2: Optional[int] = None
    temp_c: Optional[float] = None
    resp_rate: Optional[int] = None
    pain_score: Optional[int] = None


class PatientHandoffRequest(BaseModel):
    pulseq_patient_id: str
    patient_name: str
    age: int
    gender: str
    arrival_mode: str = "ambulance"
    chief_complaint: str
    referring_doctor: Optional[str] = None
    referring_doctor_id: Optional[str] = None
    hospital_id: str = "HOSP-01"
    mrn: Optional[str] = None
    initial_vitals: Optional[InitialVitals] = None


@router.get("/sync")
def sync_status(db: Session = Depends(get_db)):
    """Health & integration sync status endpoint for PulseQ checks."""
    return {
        "success": True,
        "message": "PulseQ Emergency Integration active",
        "data": {
            "status": "synced",
            "service": "emergency",
            "integration_mode": "pulseq_connected"
        }
    }


@router.post("/handoffs")
def create_patient_handoff(
    payload: PatientHandoffRequest,
    db: Session = Depends(get_db)
):
    """Receive an emergency handoff from PulseQ main (e.g. Reception/Doctor referral).

    - Resolves/creates patient ID mapping
    - Resolves ordering/referring doctor
    - Creates an ERPatient record with status='registered'
    - Creates initial vitals log if provided
    """
    try:
        # 1. Resolve Patient ID
        er_patient_id = resolve_or_create_patient(
            db,
            pulseq_patient_id=payload.pulseq_patient_id,
            hospital_id=payload.hospital_id,
            patient_name=payload.patient_name
        )

        # 2. Resolve Doctor ID if provided
        er_doctor_id = resolve_doctor(
            db,
            pulseq_doctor_id=payload.referring_doctor_id or "",
            hospital_id=payload.hospital_id,
            doctor_name=payload.referring_doctor
        )

        # 3. Create or update ER Patient
        name_parts = payload.patient_name.split(" ", 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ""

        mrn = payload.mrn or f"ER-{payload.pulseq_patient_id[:8].upper()}"

        er_patient = m.ERPatient(
            id=er_patient_id,
            hospital_id=payload.hospital_id,
            mrn=mrn,
            first_name=first_name,
            last_name=last_name,
            age=payload.age,
            gender=payload.gender,
            arrival_mode=payload.arrival_mode,
            chief_complaint=payload.chief_complaint,
            acuity_level=2,  # Default emergent acuity
            status="registered",
            assigned_doctor_id=er_doctor_id
        )
        db.merge(er_patient)
        db.flush()

        # 4. Record initial vitals if present
        if payload.initial_vitals:
            v = payload.initial_vitals
            system_user = db.query(m.ERUser).first()
            if not system_user:
                system_user = m.ERUser(
                    hospital_id=payload.hospital_id,
                    email="system_handoff@pulseq-er.com",
                    password_hash="system",
                    full_name="PulseQ Handoff System",
                    role="nurse"
                )
                db.add(system_user)
                db.flush()

            vitals_log = m.ERVitalsLog(
                patient_id=er_patient_id,
                heart_rate=v.heart_rate,
                bp_systolic=v.bp_systolic,
                bp_diastolic=v.bp_diastolic,
                spo2=v.spo2,
                temp_c=v.temp_c,
                resp_rate=v.resp_rate,
                pain_score=v.pain_score,
                logged_by_id=system_user.id
            )
            db.add(vitals_log)

        db.commit()
        logger.info(f"Emergency handoff processed: er_patient_id={er_patient_id}, name={payload.patient_name}")

        return {
            "success": True,
            "message": "Patient handoff received successfully",
            "data": {
                "er_patient_id": er_patient_id,
                "mrn": mrn,
                "status": "registered",
                "pulseq_patient_id": payload.pulseq_patient_id
            }
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to process emergency handoff: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Handoff error: {str(e)}"
        )


@router.get("/patients/{pulseq_patient_id}")
def get_patient_er_status(
    pulseq_patient_id: str,
    hospital_id: str = "HOSP-01",
    db: Session = Depends(get_db)
):
    """Lookup ER status for a given PulseQ patient ID."""
    mapping = (
        db.query(m.PulseQIDMapping)
        .filter(
            m.PulseQIDMapping.pulseq_entity_type == "patient",
            m.PulseQIDMapping.pulseq_id == pulseq_patient_id,
            m.PulseQIDMapping.hospital_id == hospital_id
        )
        .first()
    )

    if not mapping:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No emergency record found for this patient"
        )

    patient = db.query(m.ERPatient).filter(m.ERPatient.id == mapping.er_entity_id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Emergency patient record not found"
        )

    bed = db.query(m.ERBed).filter(m.ERBed.assigned_patient_id == patient.id).first()
    return {
        "success": True,
        "data": {
            "er_patient_id": patient.id,
            "mrn": patient.mrn,
            "status": patient.status,
            "acuity_level": patient.acuity_level,
            "chief_complaint": patient.chief_complaint,
            "bed_code": bed.bed_code if bed else None,
            "registered_at": patient.registered_at.isoformat() if hasattr(patient, "registered_at") and patient.registered_at else None
        }
    }
