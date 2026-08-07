# Emergency Portal — Integration Specifications & Contract

This directory is reserved for future direct integration logic between **PulseQ Main** (Reception/Doctor Portals) and the **Emergency Portal**.

When `INTEGRATION_MODE=pulseq_connected` is activated:

## 1. Incoming Patient Handoffs (PulseQ → Emergency)
- **Endpoint**: `POST /api/v1/integrations/handoffs`
- **Payload**:
  ```json
  {
    "pulseq_patient_id": "P-98214",
    "mrn": "MRN-55412",
    "patient_name": "Jane Doe",
    "age": 42,
    "gender": "Female",
    "arrival_mode": "ambulance",
    "chief_complaint": "Acute shortness of breath and chest pain",
    "referring_doctor": "Dr. Sarah Jenkins",
    "initial_vitals": {
      "heart_rate": 118,
      "bp_systolic": 145,
      "bp_diastolic": 92,
      "spo2": 91
    }
  }
  ```
- **Behavior**: Automatically creates a record in `er_patients` with `status="registered"` and places the patient into the Triage Queue for Acuity level assessment.

## 2. Outgoing Emergency Critical Alerts (Emergency → PulseQ)
- **Webhook / API**: `POST {PULSEQ_MAIN_URL}/api/v1/integrations/emergency-alerts`
- **Payload**:
  ```json
  {
    "event": "er_critical_alert_triggered",
    "alert_id": "ALT-1002",
    "hospital_id": "HOSP-01",
    "alert_type": "code_blue",
    "severity": "critical",
    "location": "Trauma Bay 1 (TR-01)",
    "patient_id": "P-98214",
    "patient_name": "Jane Doe",
    "triggered_by": "Nurse Dave (Triage)",
    "timestamp": "2026-08-06T13:45:00Z"
  }
  ```
- **Behavior**: Triggers hospital-wide high-priority notifications on PulseQ main dashboard for on-call specialists and hospital administrators.

---

### Configuration
- `INTEGRATION_MODE`: Default is `standalone`. Set to `pulseq_connected` to enable automated handoffs and outbound webhook events.
