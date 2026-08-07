import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey, Index
from app.database import Base


def generate_uuid():
    return str(uuid.uuid4())


class ERUser(Base):
    __tablename__ = "er_users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    hospital_id = Column(String(50), nullable=False, index=True, default="HOSP-01")
    email = Column(String(120), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(120), nullable=False)
    role = Column(String(50), nullable=False, default="nurse")  # nurse (single auth login role)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ERDoctor(Base):
    __tablename__ = "er_doctors"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    hospital_id = Column(String(50), nullable=False, index=True, default="HOSP-01")
    full_name = Column(String(120), nullable=False)
    specialty = Column(String(80), nullable=False, default="Emergency Medicine")
    phone = Column(String(30), nullable=True)
    status = Column(String(30), nullable=False, default="available")  # available, on_duty, busy, off_duty
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ERPatient(Base):
    __tablename__ = "er_patients"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    hospital_id = Column(String(50), nullable=False, index=True, default="HOSP-01")
    mrn = Column(String(50), unique=True, nullable=False, index=True)
    first_name = Column(String(80), nullable=False)
    last_name = Column(String(80), nullable=False)
    age = Column(Integer, nullable=False)
    gender = Column(String(20), nullable=False)
    arrival_mode = Column(String(30), nullable=False, default="walk_in")  # walk_in, ambulance
    chief_complaint = Column(Text, nullable=False)
    acuity_level = Column(Integer, nullable=False, default=3)  # ESI 1 (Resuscitation) to 5 (Non-urgent)
    status = Column(String(40), nullable=False, default="registered")  # registered, triaged, bed_assigned, doctor_assigned, discharged, transferred
    assigned_doctor_id = Column(String(36), ForeignKey("er_doctors.id"), nullable=True)
    assigned_nurse_id = Column(String(36), ForeignKey("er_users.id"), nullable=True)
    assigned_bed_id = Column(String(36), ForeignKey("er_beds.id"), nullable=True)
    registered_at = Column(DateTime, default=datetime.utcnow)
    triaged_at = Column(DateTime, nullable=True)
    discharged_at = Column(DateTime, nullable=True)


class ERBed(Base):
    __tablename__ = "er_beds"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    hospital_id = Column(String(50), nullable=False, index=True, default="HOSP-01")
    bed_code = Column(String(30), nullable=False, index=True)  # e.g., TR-01, RES-01, BED-05
    section = Column(String(40), nullable=False, default="main_er")  # trauma_bay, resuscitation, main_er, pediatric_er, isolation
    status = Column(String(30), nullable=False, default="empty")  # empty, occupied, cleaning, reserved
    assigned_patient_id = Column(String(36), ForeignKey("er_patients.id"), nullable=True)
    assigned_staff_id = Column(String(36), ForeignKey("er_users.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ERResource(Base):
    __tablename__ = "er_resources"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    hospital_id = Column(String(50), nullable=False, index=True, default="HOSP-01")
    resource_name = Column(String(100), nullable=False)
    resource_type = Column(String(40), nullable=False, default="equipment")  # equipment, facility, imaging
    status = Column(String(30), nullable=False, default="available")  # available, in_use, maintenance
    current_location = Column(String(100), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ERCriticalAlert(Base):
    __tablename__ = "er_critical_alerts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    hospital_id = Column(String(50), nullable=False, index=True, default="HOSP-01")
    alert_type = Column(String(50), nullable=False)  # code_blue, trauma_alert, cardiac_arrest, stroke_alert, sepsis_alert
    severity = Column(String(30), nullable=False, default="critical")  # critical, high, moderate
    patient_id = Column(String(36), ForeignKey("er_patients.id"), nullable=True)
    location_bed_id = Column(String(36), ForeignKey("er_beds.id"), nullable=True)
    triggered_by_id = Column(String(36), ForeignKey("er_users.id"), nullable=False)
    dispatched_doctor_id = Column(String(36), ForeignKey("er_doctors.id"), nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(String(30), nullable=False, default="active")  # active, acknowledged, resolved
    triggered_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)


class ERVitalsLog(Base):
    __tablename__ = "er_vitals_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    patient_id = Column(String(36), ForeignKey("er_patients.id"), nullable=False)
    heart_rate = Column(Integer, nullable=True)
    bp_systolic = Column(Integer, nullable=True)
    bp_diastolic = Column(Integer, nullable=True)
    spo2 = Column(Integer, nullable=True)
    temp_c = Column(Float, nullable=True)
    resp_rate = Column(Integer, nullable=True)
    pain_score = Column(Integer, nullable=True)
    logged_by_id = Column(String(36), ForeignKey("er_users.id"), nullable=False)
    logged_at = Column(DateTime, default=datetime.utcnow)


class ERFailedLogin(Base):
    """Persistent storage for login attempt rate-limiting & lockouts across server restarts."""
    __tablename__ = "er_failed_logins"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    identifier = Column(String(200), nullable=False, index=True, unique=True)  # email:ip_address key
    email = Column(String(120), nullable=False, index=True)
    ip_address = Column(String(50), nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime, nullable=True)
    last_attempt_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PulseQIDMapping(Base):
    """Links PulseQ main entity UUIDs (patient/doctor/hospital) to internal Emergency Portal entity IDs."""
    __tablename__ = "pulseq_id_mappings"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    pulseq_entity_type = Column(String(20), nullable=False)  # "patient" | "doctor" | "hospital" | "visit"
    pulseq_id = Column(String(36), nullable=False, index=True)
    er_entity_id = Column(String(36), nullable=False, index=True)
    hospital_id = Column(String(50), nullable=False, index=True, default="HOSP-01")
    pulseq_name = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index(
            "uq_er_pulseq_mapping",
            "pulseq_entity_type",
            "pulseq_id",
            "hospital_id",
            unique=True,
        ),
    )
