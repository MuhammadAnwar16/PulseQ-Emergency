from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field


# Auth Schemas
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    id: str
    hospital_id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Doctor Registry Schemas (Standalone Entity)
class DoctorCreate(BaseModel):
    full_name: str
    specialty: str = "Emergency Medicine"
    phone: Optional[str] = None
    status: str = "available"  # available, on_duty, busy, off_duty


class DoctorUpdateStatus(BaseModel):
    status: str  # available, on_duty, busy, off_duty


class DoctorResponse(BaseModel):
    id: str
    hospital_id: str
    full_name: str
    specialty: str
    phone: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# Vitals Schema
class VitalsCreate(BaseModel):
    heart_rate: Optional[int] = Field(None, ge=20, le=250)
    bp_systolic: Optional[int] = Field(None, ge=40, le=300)
    bp_diastolic: Optional[int] = Field(None, ge=20, le=200)
    spo2: Optional[int] = Field(None, ge=50, le=100)
    temp_c: Optional[float] = Field(None, ge=30.0, le=45.0)
    resp_rate: Optional[int] = Field(None, ge=4, le=60)
    pain_score: Optional[int] = Field(None, ge=0, le=10)


class VitalsResponse(VitalsCreate):
    id: str
    patient_id: str
    logged_by_id: str
    logged_at: datetime

    class Config:
        from_attributes = True


# Patient Schemas
class PatientCreate(BaseModel):
    first_name: str
    last_name: str
    age: int
    gender: str
    arrival_mode: str = "walk_in"  # walk_in, ambulance
    chief_complaint: str
    acuity_level: int = 3  # ESI 1 to 5
    vitals: Optional[VitalsCreate] = None


class PatientTriageUpdate(BaseModel):
    acuity_level: int = Field(..., ge=1, le=5)
    chief_complaint: Optional[str] = None
    vitals: Optional[VitalsCreate] = None


class PatientAssignDoctor(BaseModel):
    doctor_id: str


class PatientAssignBed(BaseModel):
    bed_id: str


class PatientResponse(BaseModel):
    id: str
    hospital_id: str
    mrn: str
    first_name: str
    last_name: str
    age: int
    gender: str
    arrival_mode: str
    chief_complaint: str
    acuity_level: int
    status: str
    assigned_doctor_id: Optional[str] = None
    assigned_nurse_id: Optional[str] = None
    assigned_bed_id: Optional[str] = None
    registered_at: datetime
    triaged_at: Optional[datetime] = None
    discharged_at: Optional[datetime] = None
    latest_vitals: Optional[VitalsResponse] = None

    class Config:
        from_attributes = True


# Bed Schemas
class BedUpdateStatus(BaseModel):
    status: str  # empty, occupied, cleaning, reserved
    assigned_patient_id: Optional[str] = None
    assigned_staff_id: Optional[str] = None


class BedResponse(BaseModel):
    id: str
    hospital_id: str
    bed_code: str
    section: str
    status: str
    assigned_patient_id: Optional[str] = None
    assigned_staff_id: Optional[str] = None
    patient_name: Optional[str] = None
    acuity_level: Optional[int] = None
    updated_at: datetime

    class Config:
        from_attributes = True


# Resource Schemas
class ResourceUpdateStatus(BaseModel):
    status: str  # available, in_use, maintenance
    current_location: Optional[str] = None


class ResourceResponse(BaseModel):
    id: str
    hospital_id: str
    resource_name: str
    resource_type: str
    status: str
    current_location: Optional[str] = None
    updated_at: datetime

    class Config:
        from_attributes = True


# Alert Schemas
class CriticalAlertCreate(BaseModel):
    alert_type: str  # code_blue, trauma_alert, cardiac_arrest, stroke_alert, sepsis_alert
    severity: str = "critical"
    patient_id: Optional[str] = None
    location_bed_id: Optional[str] = None
    notes: Optional[str] = None


class CriticalAlertDispatch(BaseModel):
    dispatched_doctor_id: str


class CriticalAlertResponse(BaseModel):
    id: str
    hospital_id: str
    alert_type: str
    severity: str
    patient_id: Optional[str] = None
    location_bed_id: Optional[str] = None
    triggered_by_id: str
    dispatched_doctor_id: Optional[str] = None
    notes: Optional[str] = None
    status: str
    triggered_at: datetime
    resolved_at: Optional[datetime] = None
    triggered_by_name: Optional[str] = None
    patient_name: Optional[str] = None
    location_bed_code: Optional[str] = None
    dispatched_doctor_name: Optional[str] = None

    class Config:
        from_attributes = True


# Dashboard Metrics Schema
class DashboardMetricsResponse(BaseModel):
    active_alerts_count: int
    total_active_patients: int
    beds_occupied_count: int
    beds_total_count: int
    beds_cleaning_count: int
    acuity_breakdown: dict[int, int]
