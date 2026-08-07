import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import {
  Patient, Bed, Resource, CriticalAlert, DashboardMetrics, VitalsLog, User, Doctor
} from '../models/emergency.models';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private get headers(): HttpHeaders {
    const token = this.auth.token();
    let h = new HttpHeaders();
    if (token) {
      h = h.set('Authorization', `Bearer ${token}`);
    }
    return h;
  }

  // Dashboard
  getDashboardMetrics(): Observable<DashboardMetrics> {
    return this.http.get<DashboardMetrics>(`${environment.apiBaseUrl}/emergency/dashboard-metrics`, { headers: this.headers });
  }

  // Doctors Registry (Standalone Entity)
  getDoctors(status?: string): Observable<Doctor[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<Doctor[]>(`${environment.apiBaseUrl}/emergency/doctors`, { headers: this.headers, params });
  }

  createDoctor(payload: { full_name: string; specialty: string; phone?: string; status?: string }): Observable<Doctor> {
    return this.http.post<Doctor>(`${environment.apiBaseUrl}/emergency/doctors`, payload, { headers: this.headers });
  }

  updateDoctorStatus(doctorId: string, status: string): Observable<Doctor> {
    return this.http.put<Doctor>(`${environment.apiBaseUrl}/emergency/doctors/${doctorId}/status`, { status }, { headers: this.headers });
  }

  // Staff
  getStaff(role?: string): Observable<User[]> {
    let params = new HttpParams();
    if (role) params = params.set('role', role);
    return this.http.get<User[]>(`${environment.apiBaseUrl}/emergency/staff`, { headers: this.headers, params });
  }

  // Patients & Triage
  getPatients(options?: { status_filter?: string; acuity_filter?: number; search?: string }): Observable<Patient[]> {
    let params = new HttpParams();
    if (options?.status_filter) params = params.set('status_filter', options.status_filter);
    if (options?.acuity_filter) params = params.set('acuity_filter', options.acuity_filter.toString());
    if (options?.search) params = params.set('search', options.search);

    return this.http.get<Patient[]>(`${environment.apiBaseUrl}/emergency/patients`, { headers: this.headers, params });
  }

  getPatient(patientId: string): Observable<Patient> {
    return this.http.get<Patient>(`${environment.apiBaseUrl}/emergency/patients/${patientId}`, { headers: this.headers });
  }

  createRapidTriage(payload: any): Observable<Patient> {
    return this.http.post<Patient>(`${environment.apiBaseUrl}/emergency/patients/intake`, payload, { headers: this.headers });
  }

  updateTriage(patientId: string, payload: any): Observable<Patient> {
    return this.http.put<Patient>(`${environment.apiBaseUrl}/emergency/patients/${patientId}/triage`, payload, { headers: this.headers });
  }

  assignDoctor(patientId: string, doctorId: string): Observable<Patient> {
    return this.http.put<Patient>(`${environment.apiBaseUrl}/emergency/patients/${patientId}/assign-doctor`, { doctor_id: doctorId }, { headers: this.headers });
  }

  assignBed(patientId: string, bedId: string): Observable<Patient> {
    return this.http.put<Patient>(`${environment.apiBaseUrl}/emergency/patients/${patientId}/assign-bed`, { bed_id: bedId }, { headers: this.headers });
  }

  dischargePatient(patientId: string): Observable<Patient> {
    return this.http.post<Patient>(`${environment.apiBaseUrl}/emergency/patients/${patientId}/discharge`, {}, { headers: this.headers });
  }

  logVitals(patientId: string, payload: VitalsLog): Observable<VitalsLog> {
    return this.http.post<VitalsLog>(`${environment.apiBaseUrl}/emergency/patients/${patientId}/vitals`, payload, { headers: this.headers });
  }

  getPatientPdfUrl(patientId: string): string {
    return `${environment.apiBaseUrl}/emergency/patients/${patientId}/pdf-summary`;
  }

  // Beds & Resources
  getBeds(section?: string, status_filter?: string): Observable<Bed[]> {
    let params = new HttpParams();
    if (section) params = params.set('section', section);
    if (status_filter) params = params.set('status_filter', status_filter);

    return this.http.get<Bed[]>(`${environment.apiBaseUrl}/emergency/beds`, { headers: this.headers, params });
  }

  updateBedStatus(bedId: string, status: string, assignedStaffId?: string): Observable<Bed> {
    return this.http.put<Bed>(`${environment.apiBaseUrl}/emergency/beds/${bedId}/status`, {
      status,
      assigned_staff_id: assignedStaffId
    }, { headers: this.headers });
  }

  getResources(resourceType?: string): Observable<Resource[]> {
    let params = new HttpParams();
    if (resourceType) params = params.set('resource_type', resourceType);

    return this.http.get<Resource[]>(`${environment.apiBaseUrl}/emergency/resources`, { headers: this.headers, params });
  }

  updateResourceStatus(resourceId: string, status: string, currentLocation?: string): Observable<Resource> {
    return this.http.put<Resource>(`${environment.apiBaseUrl}/emergency/resources/${resourceId}/status`, {
      status,
      current_location: currentLocation
    }, { headers: this.headers });
  }

  // Critical Alerts
  getCriticalAlerts(status_filter?: string): Observable<CriticalAlert[]> {
    let params = new HttpParams();
    if (status_filter) params = params.set('status_filter', status_filter);

    return this.http.get<CriticalAlert[]>(`${environment.apiBaseUrl}/emergency/critical-alerts`, { headers: this.headers, params });
  }

  triggerCriticalAlert(payload: { alert_type: string; severity?: string; patient_id?: string; location_bed_id?: string; notes?: string }): Observable<CriticalAlert> {
    return this.http.post<CriticalAlert>(`${environment.apiBaseUrl}/emergency/critical-alerts`, payload, { headers: this.headers });
  }

  dispatchDoctorToAlert(alertId: string, doctorId: string): Observable<CriticalAlert> {
    return this.http.put<CriticalAlert>(`${environment.apiBaseUrl}/emergency/critical-alerts/${alertId}/dispatch`, {
      dispatched_doctor_id: doctorId
    }, { headers: this.headers });
  }

  resolveCriticalAlert(alertId: string): Observable<CriticalAlert> {
    return this.http.put<CriticalAlert>(`${environment.apiBaseUrl}/emergency/critical-alerts/${alertId}/resolve`, {}, { headers: this.headers });
  }
}
