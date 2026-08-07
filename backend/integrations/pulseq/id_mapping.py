"""PulseQ ↔ Emergency Portal ID mapping table and resolution helpers.

PulseQ Main and the Emergency Portal maintain separate databases. When PulseQ sends
a patient handoff referencing its own patient/doctor/hospital UUIDs, this module
creates a mapping row so the Emergency Portal can track entity relationships.

Supports mapping for:
- "hospital": Maps PulseQ hospital ID → Emergency Portal hospital ID
- "patient": Maps PulseQ patient ID → Emergency Portal patient ID
- "doctor": Maps PulseQ doctor ID → Emergency Portal doctor ID
- "token": Maps PulseQ visit/token ID → Emergency Portal patient ID
"""
import uuid
from datetime import datetime
from sqlalchemy.orm import Session

from app.db_models import PulseQIDMapping, ERPatient, ERDoctor


def resolve_or_create_patient(
    db: Session,
    *,
    pulseq_patient_id: str,
    hospital_id: str,
    patient_name: str,
) -> str:
    """Return a stable Emergency Portal patient ID for the given PulseQ patient."""
    existing = (
        db.query(PulseQIDMapping)
        .filter(
            PulseQIDMapping.pulseq_entity_type == "patient",
            PulseQIDMapping.pulseq_id == pulseq_patient_id,
            PulseQIDMapping.hospital_id == hospital_id,
        )
        .first()
    )

    if existing:
        existing.pulseq_name = patient_name
        existing.updated_at = datetime.utcnow()
        db.flush()
        return existing.er_entity_id

    # Check if patient exists by MRN / ID
    er_patient_id = str(uuid.uuid4())
    mapping = PulseQIDMapping(
        pulseq_entity_type="patient",
        pulseq_id=pulseq_patient_id,
        er_entity_id=er_patient_id,
        hospital_id=hospital_id,
        pulseq_name=patient_name,
    )
    db.add(mapping)
    db.flush()
    return er_patient_id


def resolve_doctor(
    db: Session,
    *,
    pulseq_doctor_id: str,
    hospital_id: str,
    doctor_name: str | None = None,
) -> str | None:
    """Return a stable Emergency Portal doctor ID for the given PulseQ doctor."""
    if not pulseq_doctor_id:
        return None

    existing = (
        db.query(PulseQIDMapping)
        .filter(
            PulseQIDMapping.pulseq_entity_type == "doctor",
            PulseQIDMapping.pulseq_id == pulseq_doctor_id,
            PulseQIDMapping.hospital_id == hospital_id,
        )
        .first()
    )

    if existing:
        if doctor_name:
            existing.pulseq_name = doctor_name
            existing.updated_at = datetime.utcnow()
            db.flush()
        return existing.er_entity_id

    er_doctor_id = str(uuid.uuid4())
    mapping = PulseQIDMapping(
        pulseq_entity_type="doctor",
        pulseq_id=pulseq_doctor_id,
        er_entity_id=er_doctor_id,
        hospital_id=hospital_id,
        pulseq_name=doctor_name,
    )
    db.add(mapping)
    db.flush()
    return er_doctor_id


def get_pulseq_patient_id(
    db: Session, *, er_patient_id: str, hospital_id: str
) -> str | None:
    """Reverse-lookup: Emergency patient ID → PulseQ patient ID."""
    row = (
        db.query(PulseQIDMapping.pulseq_id)
        .filter(
            PulseQIDMapping.pulseq_entity_type == "patient",
            PulseQIDMapping.er_entity_id == er_patient_id,
            PulseQIDMapping.hospital_id == hospital_id,
        )
        .first()
    )
    return row[0] if row else None
