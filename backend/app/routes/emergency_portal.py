import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.db_models import (
    ERUser, ERDoctor, ERPatient, ERBed, ERResource, ERCriticalAlert, ERVitalsLog
)
from app.schemas import (
    PatientCreate, PatientTriageUpdate, PatientAssignDoctor, PatientAssignBed,
    PatientResponse, BedUpdateStatus, BedResponse, ResourceUpdateStatus, ResourceResponse,
    CriticalAlertCreate, CriticalAlertDispatch, CriticalAlertResponse, DashboardMetricsResponse,
    VitalsCreate, VitalsResponse, UserResponse, DoctorCreate, DoctorResponse, DoctorUpdateStatus
)
from app.security import get_current_user, require_roles
from app.realtime import broadcast_er_event
from app.reporting import generate_er_discharge_pdf

router = APIRouter(prefix="/emergency", tags=["Emergency Portal Operations"])


def generate_mrn():
    return f"ER-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:4].upper()}"


# ==========================================
# DOCTORS REGISTRY (STANDALONE ENTITY)
# ==========================================
@router.get("/doctors", response_model=List[DoctorResponse])
def get_doctors(
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    query = db.query(ERDoctor).filter(ERDoctor.hospital_id == current_user.hospital_id)
    if status:
        query = query.filter(ERDoctor.status == status)
    return query.order_by(ERDoctor.full_name.asc()).all()


@router.post("/doctors", response_model=DoctorResponse, status_code=status.HTTP_201_CREATED)
def create_doctor(
    payload: DoctorCreate,
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    new_doc = ERDoctor(
        hospital_id=current_user.hospital_id,
        full_name=payload.full_name.strip(),
        specialty=payload.specialty.strip(),
        phone=payload.phone.strip() if payload.phone else None,
        status=payload.status
    )
    try:
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit failed creating doctor: {str(e)}")

    broadcast_er_event(current_user.hospital_id, "er_doctor_status_updated", {
        "doctor_id": new_doc.id,
        "full_name": new_doc.full_name,
        "status": new_doc.status
    })

    return new_doc


@router.put("/doctors/{doctor_id}/status", response_model=DoctorResponse)
def update_doctor_status(
    doctor_id: str,
    payload: DoctorUpdateStatus,
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    doc = db.query(ERDoctor).filter(
        ERDoctor.id == doctor_id,
        ERDoctor.hospital_id == current_user.hospital_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Doctor not found")

    doc.status = payload.status
    try:
        db.commit()
        db.refresh(doc)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit failed updating doctor status: {str(e)}")

    broadcast_er_event(current_user.hospital_id, "er_doctor_status_updated", {
        "doctor_id": doc.id,
        "full_name": doc.full_name,
        "status": doc.status
    })

    return doc


# ==========================================
# STAFF & USERS LISTING
# ==========================================
@router.get("/staff", response_model=List[UserResponse])
def get_staff_members(
    role: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    query = db.query(ERUser).filter(ERUser.hospital_id == current_user.hospital_id, ERUser.is_active == True)
    if role:
        query = query.filter(ERUser.role == role)
    return query.all()


# ==========================================
# DASHBOARD METRICS
# ==========================================
@router.get("/dashboard-metrics", response_model=DashboardMetricsResponse)
def get_dashboard_metrics(
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    h_id = current_user.hospital_id

    active_alerts_count = db.query(ERCriticalAlert).filter(
        ERCriticalAlert.hospital_id == h_id,
        ERCriticalAlert.status != "resolved"
    ).count()

    total_active_patients = db.query(ERPatient).filter(
        ERPatient.hospital_id == h_id,
        ERPatient.status.notin_(["discharged", "transferred"])
    ).count()

    beds_total_count = db.query(ERBed).filter(ERBed.hospital_id == h_id).count()
    beds_occupied_count = db.query(ERBed).filter(ERBed.hospital_id == h_id, ERBed.status == "occupied").count()
    beds_cleaning_count = db.query(ERBed).filter(ERBed.hospital_id == h_id, ERBed.status == "cleaning").count()

    acuity_breakdown = {}
    for level in range(1, 6):
        count = db.query(ERPatient).filter(
            ERPatient.hospital_id == h_id,
            ERPatient.status.notin_(["discharged", "transferred"]),
            ERPatient.acuity_level == level
        ).count()
        acuity_breakdown[level] = count

    return {
        "active_alerts_count": active_alerts_count,
        "total_active_patients": total_active_patients,
        "beds_occupied_count": beds_occupied_count,
        "beds_total_count": beds_total_count,
        "beds_cleaning_count": beds_cleaning_count,
        "acuity_breakdown": acuity_breakdown
    }


# ==========================================
# PATIENTS & TRIAGE INTAKE
# ==========================================
@router.get("/patients", response_model=List[PatientResponse])
def get_patients(
    status_filter: Optional[str] = Query(None),
    acuity_filter: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    query = db.query(ERPatient).filter(ERPatient.hospital_id == current_user.hospital_id)

    if status_filter == "active":
        query = query.filter(ERPatient.status.notin_(["discharged", "transferred"]))
    elif status_filter == "discharged":
        query = query.filter(ERPatient.status == "discharged")
    elif status_filter:
        query = query.filter(ERPatient.status == status_filter)

    if acuity_filter:
        query = query.filter(ERPatient.acuity_level == acuity_filter)

    if search:
        search_fmt = f"%{search.strip()}%"
        query = query.filter(
            (ERPatient.first_name.ilike(search_fmt)) |
            (ERPatient.last_name.ilike(search_fmt)) |
            (ERPatient.mrn.ilike(search_fmt)) |
            (ERPatient.chief_complaint.ilike(search_fmt))
        )

    patients = query.order_by(ERPatient.acuity_level.asc(), desc(ERPatient.registered_at)).all()

    res = []
    for p in patients:
        p_res = PatientResponse.from_orm(p)
        latest_vitals = db.query(ERVitalsLog).filter(
            ERVitalsLog.patient_id == p.id
        ).order_by(desc(ERVitalsLog.logged_at)).first()
        if latest_vitals:
            p_res.latest_vitals = VitalsResponse.from_orm(latest_vitals)
        res.append(p_res)

    return res


@router.get("/patients/{patient_id}", response_model=PatientResponse)
def get_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    patient = db.query(ERPatient).filter(
        ERPatient.id == patient_id,
        ERPatient.hospital_id == current_user.hospital_id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    p_res = PatientResponse.from_orm(patient)
    latest_vitals = db.query(ERVitalsLog).filter(
        ERVitalsLog.patient_id == patient.id
    ).order_by(desc(ERVitalsLog.logged_at)).first()
    if latest_vitals:
        p_res.latest_vitals = VitalsResponse.from_orm(latest_vitals)

    return p_res


@router.post("/patients/intake", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
def intake_patient(
    payload: PatientCreate,
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    mrn = generate_mrn()
    new_patient = ERPatient(
        hospital_id=current_user.hospital_id,
        mrn=mrn,
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        age=payload.age,
        gender=payload.gender.lower(),
        arrival_mode=payload.arrival_mode,
        chief_complaint=payload.chief_complaint.strip(),
        acuity_level=payload.acuity_level,
        status="triaged",
        assigned_nurse_id=current_user.id,
        registered_at=datetime.utcnow(),
        triaged_at=datetime.utcnow()
    )

    try:
        db.add(new_patient)
        db.flush()

        if payload.vitals:
            vitals_record = ERVitalsLog(
                patient_id=new_patient.id,
                heart_rate=payload.vitals.heart_rate,
                bp_systolic=payload.vitals.bp_systolic,
                bp_diastolic=payload.vitals.bp_diastolic,
                spo2=payload.vitals.spo2,
                temp_c=payload.vitals.temp_c,
                resp_rate=payload.vitals.resp_rate,
                pain_score=payload.vitals.pain_score,
                logged_by_id=current_user.id,
                logged_at=datetime.utcnow()
            )
            db.add(vitals_record)

        db.commit()
        db.refresh(new_patient)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit failed during patient intake: {str(e)}")

    broadcast_er_event(current_user.hospital_id, "er_patient_created", {
        "patient_id": new_patient.id,
        "mrn": new_patient.mrn,
        "name": f"{new_patient.first_name} {new_patient.last_name}",
        "acuity_level": new_patient.acuity_level,
        "arrival_mode": new_patient.arrival_mode,
        "status": new_patient.status
    })

    return new_patient


@router.put("/patients/{patient_id}/triage", response_model=PatientResponse)
def update_triage_assessment(
    patient_id: str,
    payload: PatientTriageUpdate,
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    patient = db.query(ERPatient).filter(
        ERPatient.id == patient_id,
        ERPatient.hospital_id == current_user.hospital_id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    patient.acuity_level = payload.acuity_level
    if payload.chief_complaint:
        patient.chief_complaint = payload.chief_complaint.strip()
    patient.triaged_at = datetime.utcnow()

    try:
        if payload.vitals:
            vitals_record = ERVitalsLog(
                patient_id=patient.id,
                heart_rate=payload.vitals.heart_rate,
                bp_systolic=payload.vitals.bp_systolic,
                bp_diastolic=payload.vitals.bp_diastolic,
                spo2=payload.vitals.spo2,
                temp_c=payload.vitals.temp_c,
                resp_rate=payload.vitals.resp_rate,
                pain_score=payload.vitals.pain_score,
                logged_by_id=current_user.id,
                logged_at=datetime.utcnow()
            )
            db.add(vitals_record)

        db.commit()
        db.refresh(patient)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit failed during triage update: {str(e)}")

    broadcast_er_event(current_user.hospital_id, "er_patient_triaged", {
        "patient_id": patient.id,
        "acuity_level": patient.acuity_level,
        "status": patient.status
    })

    return patient


@router.put("/patients/{patient_id}/assign-doctor", response_model=PatientResponse)
def assign_doctor(
    patient_id: str,
    payload: PatientAssignDoctor,
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    is_postgres = db.bind and db.bind.dialect.name == "postgresql"

    try:
        # 1. Lock Doctor FIRST with with_for_update()
        doc_query = db.query(ERDoctor).filter(
            ERDoctor.id == payload.doctor_id,
            ERDoctor.hospital_id == current_user.hospital_id
        )
        if is_postgres:
            doc_query = doc_query.with_for_update()
        doctor = doc_query.first()

        if not doctor:
            raise HTTPException(status_code=404, detail="Assigned doctor not found in registry")

        # Atomic Status Check: Doctor must be available or on_duty
        if doctor.status in ("busy", "off_duty"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Doctor {doctor.full_name} is currently {doctor.status} and cannot be assigned"
            )

        # 2. Lock Patient
        patient_query = db.query(ERPatient).filter(
            ERPatient.id == patient_id,
            ERPatient.hospital_id == current_user.hospital_id
        )
        if is_postgres:
            patient_query = patient_query.with_for_update()
        patient = patient_query.first()

        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")

        patient.assigned_doctor_id = doctor.id
        if patient.status in ["registered", "triaged"]:
            patient.status = "doctor_assigned"

        doctor.status = "busy"

        db.commit()
        db.refresh(patient)
        db.refresh(doctor)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit failed during doctor assignment: {str(e)}")

    broadcast_er_event(current_user.hospital_id, "er_patient_updated", {
        "patient_id": patient.id,
        "assigned_doctor_id": doctor.id,
        "assigned_doctor_name": doctor.full_name,
        "status": patient.status
    })
    broadcast_er_event(current_user.hospital_id, "er_doctor_status_updated", {
        "doctor_id": doctor.id,
        "full_name": doctor.full_name,
        "status": doctor.status
    })

    return patient


@router.put("/patients/{patient_id}/assign-bed", response_model=PatientResponse)
def assign_bed_to_patient(
    patient_id: str,
    payload: PatientAssignBed,
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    is_postgres = db.bind and db.bind.dialect.name == "postgresql"

    try:
        # 1. Lock Target Bed FIRST with with_for_update()
        bed_query = db.query(ERBed).filter(
            ERBed.id == payload.bed_id,
            ERBed.hospital_id == current_user.hospital_id
        )
        if is_postgres:
            bed_query = bed_query.with_for_update()
        target_bed = bed_query.first()

        if not target_bed:
            raise HTTPException(status_code=404, detail="Target bed not found")

        # Atomic Row-Level Check
        if target_bed.status != "empty" or target_bed.assigned_patient_id is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Bed {target_bed.bed_code} is no longer available (current status: {target_bed.status})"
            )

        # 2. Lock Patient
        patient_query = db.query(ERPatient).filter(
            ERPatient.id == patient_id,
            ERPatient.hospital_id == current_user.hospital_id
        )
        if is_postgres:
            patient_query = patient_query.with_for_update()
        patient = patient_query.first()

        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")

        old_bed_id = patient.assigned_bed_id
        if old_bed_id and old_bed_id != target_bed.id:
            old_bed_query = db.query(ERBed).filter(ERBed.id == old_bed_id)
            if is_postgres:
                old_bed_query = old_bed_query.with_for_update()
            old_bed = old_bed_query.first()
            if old_bed:
                old_bed.status = "cleaning"
                old_bed.assigned_patient_id = None

        patient.assigned_bed_id = target_bed.id
        if patient.status in ["registered", "triaged"]:
            patient.status = "bed_assigned"

        target_bed.assigned_patient_id = patient.id
        target_bed.status = "occupied"

        db.commit()
        db.refresh(patient)
        db.refresh(target_bed)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit failed during bed assignment: {str(e)}")

    broadcast_er_event(current_user.hospital_id, "er_patient_assigned_bed", {
        "patient_id": patient.id,
        "bed_id": target_bed.id,
        "bed_code": target_bed.bed_code,
        "status": patient.status
    })

    return patient


@router.post("/patients/{patient_id}/vitals", response_model=VitalsResponse, status_code=status.HTTP_201_CREATED)
def log_vitals(
    patient_id: str,
    payload: VitalsCreate,
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    patient = db.query(ERPatient).filter(
        ERPatient.id == patient_id,
        ERPatient.hospital_id == current_user.hospital_id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    vitals = ERVitalsLog(
        patient_id=patient.id,
        heart_rate=payload.heart_rate,
        bp_systolic=payload.bp_systolic,
        bp_diastolic=payload.bp_diastolic,
        spo2=payload.spo2,
        temp_c=payload.temp_c,
        resp_rate=payload.resp_rate,
        pain_score=payload.pain_score,
        logged_by_id=current_user.id,
        logged_at=datetime.utcnow()
    )

    try:
        db.add(vitals)
        db.commit()
        db.refresh(vitals)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit failed logging vitals: {str(e)}")

    broadcast_er_event(current_user.hospital_id, "er_vitals_logged", {
        "patient_id": patient.id,
        "vitals_id": vitals.id,
        "heart_rate": vitals.heart_rate,
        "spo2": vitals.spo2
    })

    return vitals


@router.post("/patients/{patient_id}/discharge", response_model=PatientResponse)
def discharge_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    patient = db.query(ERPatient).filter(
        ERPatient.id == patient_id,
        ERPatient.hospital_id == current_user.hospital_id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    patient.status = "discharged"
    patient.discharged_at = datetime.utcnow()

    # If assigned to a bed, mark bed as cleaning in same transaction
    if patient.assigned_bed_id:
        b = db.query(ERBed).filter(ERBed.id == patient.assigned_bed_id).first()
        if b:
            b.status = "cleaning"
            b.assigned_patient_id = None
        patient.assigned_bed_id = None

    # AUTOMATIC STATUS UPDATE: If a doctor was assigned, transition doctor back to "available"
    if patient.assigned_doctor_id:
        doc = db.query(ERDoctor).filter(ERDoctor.id == patient.assigned_doctor_id).first()
        if doc:
            doc.status = "available"

    try:
        db.commit()
        db.refresh(patient)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit failed discharging patient: {str(e)}")

    broadcast_er_event(current_user.hospital_id, "er_patient_discharged", {
        "patient_id": patient.id,
        "discharged_at": patient.discharged_at.isoformat()
    })

    return patient


@router.get("/patients/{patient_id}/pdf-summary")
def download_patient_pdf(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    patient = db.query(ERPatient).filter(
        ERPatient.id == patient_id,
        ERPatient.hospital_id == current_user.hospital_id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    vitals = db.query(ERVitalsLog).filter(
        ERVitalsLog.patient_id == patient.id
    ).order_by(desc(ERVitalsLog.logged_at)).all()

    doctor_name = None
    if patient.assigned_doctor_id:
        doc = db.query(ERDoctor).filter(ERDoctor.id == patient.assigned_doctor_id).first()
        if doc:
            doctor_name = doc.full_name

    pdf_path = generate_er_discharge_pdf(patient, vitals, doctor_name=doctor_name)
    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=f"ER_Discharge_Summary_{patient.mrn}.pdf"
    )


# ==========================================
# BEDS & RESOURCES
# ==========================================
@router.get("/beds", response_model=List[BedResponse])
def get_beds(
    section: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    query = db.query(ERBed).filter(ERBed.hospital_id == current_user.hospital_id)
    if section:
        query = query.filter(ERBed.section == section)
    if status_filter:
        query = query.filter(ERBed.status == status_filter)

    beds = query.order_by(ERBed.bed_code.asc()).all()

    res = []
    for b in beds:
        b_res = BedResponse.from_orm(b)
        if b.assigned_patient_id:
            p = db.query(ERPatient).filter(ERPatient.id == b.assigned_patient_id).first()
            if p:
                b_res.patient_name = f"{p.first_name} {p.last_name}"
                b_res.acuity_level = p.acuity_level
        res.append(b_res)
    return res


@router.put("/beds/{bed_id}/status", response_model=BedResponse)
def update_bed_status(
    bed_id: str,
    payload: BedUpdateStatus,
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    bed = db.query(ERBed).filter(
        ERBed.id == bed_id,
        ERBed.hospital_id == current_user.hospital_id
    ).first()
    if not bed:
        raise HTTPException(status_code=404, detail="Bed not found")

    old_patient_id = bed.assigned_patient_id

    try:
        bed.status = payload.status
        if payload.assigned_patient_id is not None:
            bed.assigned_patient_id = payload.assigned_patient_id
        if payload.assigned_staff_id is not None:
            bed.assigned_staff_id = payload.assigned_staff_id

        if payload.status in ["empty", "cleaning"] and old_patient_id:
            p = db.query(ERPatient).filter(ERPatient.id == old_patient_id).first()
            if p:
                p.assigned_bed_id = None
            bed.assigned_patient_id = None

        bed.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(bed)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit failed during bed status update: {str(e)}")

    broadcast_er_event(current_user.hospital_id, "er_bed_updated", {
        "bed_id": bed.id,
        "bed_code": bed.bed_code,
        "status": bed.status,
        "assigned_patient_id": bed.assigned_patient_id
    })

    b_res = BedResponse.from_orm(bed)
    if bed.assigned_patient_id:
        p = db.query(ERPatient).filter(ERPatient.id == bed.assigned_patient_id).first()
        if p:
            b_res.patient_name = f"{p.first_name} {p.last_name}"
            b_res.acuity_level = p.acuity_level
    return b_res


@router.get("/resources", response_model=List[ResourceResponse])
def get_resources(
    resource_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    query = db.query(ERResource).filter(ERResource.hospital_id == current_user.hospital_id)
    if resource_type:
        query = query.filter(ERResource.resource_type == resource_type)
    return query.order_by(ERResource.resource_name.asc()).all()


@router.put("/resources/{resource_id}/status", response_model=ResourceResponse)
def update_resource_status(
    resource_id: str,
    payload: ResourceUpdateStatus,
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    res_obj = db.query(ERResource).filter(
        ERResource.id == resource_id,
        ERResource.hospital_id == current_user.hospital_id
    ).first()
    if not res_obj:
        raise HTTPException(status_code=404, detail="Resource not found")

    try:
        res_obj.status = payload.status
        if payload.current_location is not None:
            res_obj.current_location = payload.current_location
        res_obj.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(res_obj)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit failed updating resource: {str(e)}")

    broadcast_er_event(current_user.hospital_id, "er_resource_updated", {
        "resource_id": res_obj.id,
        "resource_name": res_obj.resource_name,
        "status": res_obj.status,
        "current_location": res_obj.current_location
    })

    return res_obj


# ==========================================
# CRITICAL ALERTS & DOCTOR DISPATCH
# ==========================================
@router.get("/critical-alerts", response_model=List[CriticalAlertResponse])
def get_critical_alerts(
    status_filter: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    query = db.query(ERCriticalAlert).filter(ERCriticalAlert.hospital_id == current_user.hospital_id)
    if status_filter:
        query = query.filter(ERCriticalAlert.status == status_filter)

    alerts = query.order_by(desc(ERCriticalAlert.triggered_at)).all()

    res = []
    for a in alerts:
        a_res = CriticalAlertResponse.from_orm(a)
        trigger_user = db.query(ERUser).filter(ERUser.id == a.triggered_by_id).first()
        if trigger_user:
            a_res.triggered_by_name = trigger_user.full_name

        if a.patient_id:
            p = db.query(ERPatient).filter(ERPatient.id == a.patient_id).first()
            if p:
                a_res.patient_name = f"{p.first_name} {p.last_name}"

        if a.location_bed_id:
            b = db.query(ERBed).filter(ERBed.id == a.location_bed_id).first()
            if b:
                a_res.location_bed_code = b.bed_code

        if a.dispatched_doctor_id:
            d = db.query(ERDoctor).filter(ERDoctor.id == a.dispatched_doctor_id).first()
            if d:
                a_res.dispatched_doctor_name = d.full_name

        res.append(a_res)
    return res


@router.post("/critical-alerts", response_model=CriticalAlertResponse)
def trigger_critical_alert(
    payload: CriticalAlertCreate,
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    new_alert = ERCriticalAlert(
        hospital_id=current_user.hospital_id,
        alert_type=payload.alert_type,
        severity=payload.severity,
        patient_id=payload.patient_id,
        location_bed_id=payload.location_bed_id,
        triggered_by_id=current_user.id,
        notes=payload.notes,
        status="active",
        triggered_at=datetime.utcnow()
    )

    try:
        db.add(new_alert)
        db.commit()
        db.refresh(new_alert)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit failed triggering alert: {str(e)}")

    patient_name = None
    if new_alert.patient_id:
        p = db.query(ERPatient).filter(ERPatient.id == new_alert.patient_id).first()
        if p:
            patient_name = f"{p.first_name} {p.last_name}"

    location_code = None
    if new_alert.location_bed_id:
        b = db.query(ERBed).filter(ERBed.id == new_alert.location_bed_id).first()
        if b:
            location_code = b.bed_code

    broadcast_er_event(current_user.hospital_id, "er_alert_triggered", {
        "alert_id": new_alert.id,
        "alert_type": new_alert.alert_type,
        "severity": new_alert.severity,
        "triggered_by_name": current_user.full_name,
        "patient_name": patient_name,
        "location_bed_code": location_code,
        "notes": new_alert.notes,
        "triggered_at": new_alert.triggered_at.isoformat()
    })

    a_res = CriticalAlertResponse.from_orm(new_alert)
    a_res.triggered_by_name = current_user.full_name
    a_res.patient_name = patient_name
    a_res.location_bed_code = location_code
    return a_res


@router.put("/critical-alerts/{alert_id}/dispatch", response_model=CriticalAlertResponse)
def dispatch_doctor_to_alert(
    alert_id: str,
    payload: CriticalAlertDispatch,
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    is_postgres = db.bind and db.bind.dialect.name == "postgresql"

    try:
        # 1. Lock Doctor FIRST with with_for_update()
        doc_query = db.query(ERDoctor).filter(
            ERDoctor.id == payload.dispatched_doctor_id,
            ERDoctor.hospital_id == current_user.hospital_id
        )
        if is_postgres:
            doc_query = doc_query.with_for_update()
        doctor = doc_query.first()

        if not doctor:
            raise HTTPException(status_code=404, detail="Dispatched doctor not found in registry")

        if doctor.status in ("busy", "off_duty"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Doctor {doctor.full_name} is currently {doctor.status} and cannot be dispatched"
            )

        # 2. Lock Alert
        alert_query = db.query(ERCriticalAlert).filter(
            ERCriticalAlert.id == alert_id,
            ERCriticalAlert.hospital_id == current_user.hospital_id
        )
        if is_postgres:
            alert_query = alert_query.with_for_update()
        alert = alert_query.first()

        if not alert:
            raise HTTPException(status_code=404, detail="Critical alert not found")

        alert.dispatched_doctor_id = doctor.id
        doctor.status = "busy"

        db.commit()
        db.refresh(alert)
        db.refresh(doctor)
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit failed during doctor dispatch: {str(e)}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit failed during doctor dispatch: {str(e)}")

    broadcast_er_event(current_user.hospital_id, "er_alert_updated", {
        "alert_id": alert.id,
        "dispatched_doctor_id": doctor.id,
        "dispatched_doctor_name": doctor.full_name
    })
    broadcast_er_event(current_user.hospital_id, "er_doctor_status_updated", {
        "doctor_id": doctor.id,
        "full_name": doctor.full_name,
        "status": doctor.status
    })

    a_res = CriticalAlertResponse.from_orm(alert)
    a_res.dispatched_doctor_name = doctor.full_name
    return a_res


@router.put("/critical-alerts/{alert_id}/resolve", response_model=CriticalAlertResponse)
def resolve_critical_alert(
    alert_id: str,
    db: Session = Depends(get_db),
    current_user: ERUser = Depends(get_current_user)
):
    alert = db.query(ERCriticalAlert).filter(
        ERCriticalAlert.id == alert_id,
        ERCriticalAlert.hospital_id == current_user.hospital_id
    ).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Critical alert not found")

    alert.status = "resolved"
    alert.resolved_at = datetime.utcnow()

    # AUTOMATIC STATUS UPDATE: If a doctor was dispatched, transition doctor back to "available"
    if alert.dispatched_doctor_id:
        doc = db.query(ERDoctor).filter(ERDoctor.id == alert.dispatched_doctor_id).first()
        if doc:
            doc.status = "available"

    try:
        db.commit()
        db.refresh(alert)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database commit failed resolving alert: {str(e)}")

    broadcast_er_event(current_user.hospital_id, "er_alert_resolved", {
        "alert_id": alert.id,
        "resolved_at": alert.resolved_at.isoformat()
    })

    return alert
