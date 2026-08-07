export interface User {
  id: string;
  hospital_id: string;
  email: string;
  full_name: string;
  role: 'nurse';
  is_active: boolean;
  created_at: string;
}

export interface Doctor {
  id: string;
  hospital_id: string;
  full_name: string;
  specialty: string;
  phone?: string;
  status: 'available' | 'on_duty' | 'busy' | 'off_duty';
  created_at: string;
}

export interface VitalsLog {
  id?: string;
  patient_id?: string;
  heart_rate?: number;
  bp_systolic?: number;
  bp_diastolic?: number;
  spo2?: number;
  temp_c?: number;
  resp_rate?: number;
  pain_score?: number;
  logged_by_id?: string;
  logged_at?: string;
}

export interface Patient {
  id: string;
  hospital_id: string;
  mrn: string;
  first_name: string;
  last_name: string;
  age: number;
  gender: string;
  arrival_mode: 'walk_in' | 'ambulance';
  chief_complaint: string;
  acuity_level: 1 | 2 | 3 | 4 | 5; // 1 = Resuscitation (Red), 2 = Emergent (Orange), 3 = Urgent (Yellow), 4 = Less Urgent (Green), 5 = Non-Urgent (Blue)
  status: 'registered' | 'triaged' | 'bed_assigned' | 'doctor_assigned' | 'discharged' | 'transferred';
  assigned_doctor_id?: string;
  assigned_nurse_id?: string;
  assigned_bed_id?: string;
  registered_at: string;
  triaged_at?: string;
  discharged_at?: string;
  latest_vitals?: VitalsLog;
}

export interface Bed {
  id: string;
  hospital_id: string;
  bed_code: string;
  section: 'trauma_bay' | 'resuscitation' | 'main_er' | 'pediatric_er' | 'isolation';
  status: 'empty' | 'occupied' | 'cleaning' | 'reserved';
  assigned_patient_id?: string;
  assigned_staff_id?: string;
  patient_name?: string;
  acuity_level?: number;
  updated_at: string;
}

export interface Resource {
  id: string;
  hospital_id: string;
  resource_name: string;
  resource_type: 'equipment' | 'facility' | 'imaging';
  status: 'available' | 'in_use' | 'maintenance';
  current_location?: string;
  updated_at: string;
}

export interface CriticalAlert {
  id: string;
  hospital_id: string;
  alert_type: 'code_blue' | 'trauma_alert' | 'cardiac_arrest' | 'stroke_alert' | 'sepsis_alert';
  severity: 'critical' | 'high' | 'moderate';
  patient_id?: string;
  location_bed_id?: string;
  triggered_by_id: string;
  dispatched_doctor_id?: string;
  notes?: string;
  status: 'active' | 'acknowledged' | 'resolved';
  triggered_at: string;
  resolved_at?: string;
  triggered_by_name?: string;
  patient_name?: string;
  location_bed_code?: string;
  dispatched_doctor_name?: string;
}

export interface DashboardMetrics {
  active_alerts_count?: number;
  active_critical_alerts?: number;
  total_active_patients: number;
  beds_occupied_count: number;
  beds_total_count: number;
  beds_cleaning_count: number;
  available_beds?: number;
  total_beds?: number;
  available_doctors?: number;
  total_doctors?: number;
  acuity_breakdown?: { [key: string]: number };
  acuity_counts?: { level_1?: number; level_2?: number; level_3?: number; level_4?: number; level_5?: number };
}
