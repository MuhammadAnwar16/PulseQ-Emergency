"""Integration tests for PulseQ ↔ Emergency Portal bridge module.
Tests HMAC signature validation, patient handoff processing, ID mappings, and /sync status endpoint.
"""
import hmac
import hashlib
import json
import os
import sys
import asyncio

sys.path.insert(0, '.')
os.environ["INTEGRATION_MODE"] = "pulseq_connected"
if "PULSEQ_SHARED_SECRET" not in os.environ:
    os.environ["PULSEQ_SHARED_SECRET"] = "pulseq-emergency-shared-hmac-secret-2026"

from fastapi import HTTPException
from starlette.requests import Request
from app.database import Base, engine, SessionLocal
from app import db_models as m
from integrations.pulseq.auth import verify_pulseq_webhook, compute_signature
from integrations.pulseq.routes import PatientHandoffRequest, create_patient_handoff, sync_status, get_patient_er_status
from integrations.pulseq import id_mapping


def test_emergency_integration_flow():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    hospital_id = "HOSP-01"
    secret = os.getenv("PULSEQ_SHARED_SECRET")

    # 1. Test HMAC Auth logic
    body_bytes = b'{"pulseq_patient_id": "p-101"}'
    valid_sig = compute_signature(body_bytes, secret)

    # Missing header on POST
    req_invalid = Request({"type": "http", "method": "POST", "path": "/api/v1/integrations/pulseq/handoffs", "headers": []})
    try:
        asyncio.run(verify_pulseq_webhook(req_invalid))
        assert False, "Should fail missing signature header"
    except HTTPException as e:
        assert e.status_code == 401

    # Valid signature
    req_valid = Request({
        "type": "http",
        "method": "POST",
        "path": "/api/v1/integrations/pulseq/handoffs",
        "headers": [(b"x-pulseq-signature", valid_sig.encode())]
    })
    req_valid._body = body_bytes
    asyncio.run(verify_pulseq_webhook(req_valid))
    print("PASS: Emergency HMAC Webhook Authentication")

    # 2. Test GET /sync route
    req_sync = Request({
        "type": "http",
        "method": "GET",
        "path": "/api/v1/integrations/pulseq/sync",
        "headers": []
    })
    asyncio.run(verify_pulseq_webhook(req_sync))
    sync_res = sync_status(db=db)
    assert sync_res["success"] is True
    assert sync_res["data"]["status"] == "synced"
    print("PASS: Emergency GET /sync Status Check")

    # 3. Test Patient Handoff processing
    handoff_req = PatientHandoffRequest(
        pulseq_patient_id="patient-pulseq-uuid-er-1",
        patient_name="Alice Smith",
        age=35,
        gender="female",
        arrival_mode="ambulance",
        chief_complaint="Severe abdominal pain",
        referring_doctor="Dr. John Doe",
        referring_doctor_id="doctor-pulseq-uuid-1",
        hospital_id=hospital_id,
        mrn="MRN-ER-991",
        initial_vitals={
            "heart_rate": 105,
            "bp_systolic": 135,
            "bp_diastolic": 85,
            "spo2": 97
        }
    )

    res = create_patient_handoff(payload=handoff_req, db=db)
    assert res["success"] is True
    er_patient_id = res["data"]["er_patient_id"]
    assert res["data"]["mrn"] == "MRN-ER-991"
    print("PASS: Patient Handoff Creation")

    # 4. Test reverse status lookup
    status_res = get_patient_er_status(
        pulseq_patient_id="patient-pulseq-uuid-er-1",
        hospital_id=hospital_id,
        db=db
    )
    assert status_res["success"] is True
    assert status_res["data"]["er_patient_id"] == er_patient_id
    assert status_res["data"]["status"] == "registered"
    print("PASS: Patient ER Status Lookup")

    print("\n✅ ALL EMERGENCY INTEGRATION TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    test_emergency_integration_flow()
