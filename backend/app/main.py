import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.database import engine, Base, SessionLocal
from app.db_models import ERUser, ERDoctor, ERBed, ERResource, ERPatient, ERVitalsLog
from app.security import get_password_hash
from app.routes import auth, emergency_portal
from app import realtime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pulseq.emergency")


def check_production_security():
    """Verify security requirements prior to boot in production mode."""
    if settings.ENVIRONMENT.lower() in ("production", "prod"):
        if settings.JWT_SECRET == "emergency-portal-dev-secret-key-2026":
            raise RuntimeError(
                "CRITICAL SECURITY FAILURE: Production environment requires an explicit JWT_SECRET env var. "
                "Default development secret key cannot be used in production mode."
            )
        logger.info("Production security checks passed: JWT_SECRET is explicitly configured.")


def seed_initial_data(db: Session):
    """Seed initial ER nurse user, doctors registry, beds, equipment, and active triage patients if enabled."""
    if not settings.SEED_DEMO_DATA and settings.ENVIRONMENT.lower() in ("production", "prod"):
        logger.info("Demo data seeding disabled in production environment (SEED_DEMO_DATA=false).")
        return

    h_id = settings.DEFAULT_HOSPITAL_ID
    if db.query(ERUser).first() is None:
        logger.info("Seeding initial Emergency Portal nurse user...")
        nurse_user = ERUser(
            hospital_id=h_id,
            email="nurse@pulseq-er.com",
            password_hash=get_password_hash("password123"),
            full_name="Nurse Sarah Jenkins",
            role="nurse"
        )
        db.add(nurse_user)
        db.commit()

    if db.query(ERDoctor).first() is None:
        logger.info("Seeding initial Emergency Doctors Registry...")
        doctors = [
            ERDoctor(hospital_id=h_id, full_name="Dr. Marcus Vance", specialty="Emergency Medicine", phone="555-0192", status="available"),
            ERDoctor(hospital_id=h_id, full_name="Dr. Elena Rostova", specialty="Trauma Surgery", phone="555-0193", status="on_duty"),
            ERDoctor(hospital_id=h_id, full_name="Dr. Robert Chen", specialty="Cardiology", phone="555-0194", status="available"),
            ERDoctor(hospital_id=h_id, full_name="Dr. David Miller", specialty="Neurology", phone="555-0195", status="available"),
        ]
        db.add_all(doctors)
        db.commit()

    if db.query(ERBed).first() is None:
        logger.info("Seeding initial ER Beds...")
        beds = [
            ERBed(hospital_id=h_id, bed_code="TR-01", section="trauma_bay", status="empty"),
            ERBed(hospital_id=h_id, bed_code="TR-02", section="trauma_bay", status="empty"),
            ERBed(hospital_id=h_id, bed_code="RES-01", section="resuscitation", status="empty"),
            ERBed(hospital_id=h_id, bed_code="RES-02", section="resuscitation", status="empty"),
            ERBed(hospital_id=h_id, bed_code="BED-01", section="main_er", status="empty"),
            ERBed(hospital_id=h_id, bed_code="BED-02", section="main_er", status="empty"),
            ERBed(hospital_id=h_id, bed_code="BED-03", section="main_er", status="empty"),
            ERBed(hospital_id=h_id, bed_code="BED-04", section="main_er", status="empty"),
            ERBed(hospital_id=h_id, bed_code="ISO-01", section="isolation", status="empty"),
            ERBed(hospital_id=h_id, bed_code="PED-01", section="pediatric_er", status="empty"),
        ]
        db.add_all(beds)
        db.commit()

    if db.query(ERResource).first() is None:
        logger.info("Seeding initial ER Equipment & Resources...")
        resources = [
            ERResource(hospital_id=h_id, resource_name="Trauma Bay Ventilator #1", resource_type="equipment", status="available", current_location="TR-01"),
            ERResource(hospital_id=h_id, resource_name="Resus Defibrillator Alpha", resource_type="equipment", status="available", current_location="RES-01"),
            ERResource(hospital_id=h_id, resource_name="Portable Ultrasound (FAST Scan)", resource_type="imaging", status="available", current_location="Main ER Hallway"),
            ERResource(hospital_id=h_id, resource_name="Mobile CT Scanner", resource_type="imaging", status="available", current_location="Radiology Wing"),
            ERResource(hospital_id=h_id, resource_name="Rapid Blood Infuser", resource_type="equipment", status="available", current_location="Trauma Bay"),
        ]
        db.add_all(resources)
        db.commit()

    if db.query(ERPatient).first() is None:
        logger.info("Seeding initial ER Patients...")
        nurse = db.query(ERUser).first()

        p1 = ERPatient(
            hospital_id=h_id,
            mrn="ER-20260806-0001",
            first_name="Arthur",
            last_name="Pendleton",
            age=68,
            gender="male",
            arrival_mode="ambulance",
            chief_complaint="Severe retrosternal chest pain radiating to left jaw, diaphoresis",
            acuity_level=1,
            status="triaged",
            assigned_nurse_id=nurse.id if nurse else None
        )
        p2 = ERPatient(
            hospital_id=h_id,
            mrn="ER-20260806-0002",
            first_name="Clara",
            last_name="Oswald",
            age=34,
            gender="female",
            arrival_mode="walk_in",
            chief_complaint="Acute right lower quadrant abdominal pain, fever 38.9C, rebound tenderness",
            acuity_level=2,
            status="triaged",
            assigned_nurse_id=nurse.id if nurse else None
        )
        p3 = ERPatient(
            hospital_id=h_id,
            mrn="ER-20260806-0003",
            first_name="Robert",
            last_name="Chen",
            age=45,
            gender="male",
            arrival_mode="walk_in",
            chief_complaint="Deep laceration on right forearm, controlled bleeding",
            acuity_level=3,
            status="registered",
            assigned_nurse_id=nurse.id if nurse else None
        )
        db.add_all([p1, p2, p3])
        db.commit()

        # Seed initial vitals
        v1 = ERVitalsLog(patient_id=p1.id, heart_rate=115, bp_systolic=160, bp_diastolic=100, spo2=92, temp_c=37.1, resp_rate=24, pain_score=9, logged_by_id=nurse.id if nurse else "sys")
        v2 = ERVitalsLog(patient_id=p2.id, heart_rate=98, bp_systolic=128, bp_diastolic=82, spo2=98, temp_c=38.9, resp_rate=18, pain_score=7, logged_by_id=nurse.id if nurse else "sys")
        v3 = ERVitalsLog(patient_id=p3.id, heart_rate=80, bp_systolic=120, bp_diastolic=78, spo2=99, temp_c=36.7, resp_rate=14, pain_score=4, logged_by_id=nurse.id if nurse else "sys")
        db.add_all([v1, v2, v3])
        db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup checks & database setup
    check_production_security()
    realtime.set_main_event_loop(asyncio.get_running_loop())
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# CORS Configuration: Support explicit origins + Vercel deployment domains
cors_origins = set(settings.CORS_ORIGINS)
cors_origins.update([
    "https://pulse-q-emergency.vercel.app",
    "https://pulseq-emergency.vercel.app",
    "http://localhost:4200",
    "http://localhost:4201",
    "http://localhost:3000",
])

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(cors_origins),
    allow_origin_regex=r"https?://.*\.vercel\.app|https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "ok",
        "service": "emergency",
        "environment": settings.ENVIRONMENT,
        "integration": settings.INTEGRATION_MODE,
        "version": settings.VERSION
    }


# Mount API routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(emergency_portal.router, prefix=settings.API_V1_STR)
app.include_router(realtime.router, prefix=f"{settings.API_V1_STR}/emergency")
