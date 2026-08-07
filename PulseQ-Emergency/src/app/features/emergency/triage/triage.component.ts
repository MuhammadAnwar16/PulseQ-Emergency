import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { EmergencyRealtimeService, unwrapErRealtimeEvent } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/services/toast.service';
import { Patient, Doctor } from '../../../core/models/emergency.models';

@Component({
  selector: 'app-triage',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="triage-container">
      <div class="header-bar">
        <div>
          <h2>Patient Intake & Priority</h2>
          <p>Register incoming patients and assign priority levels for care</p>
        </div>

        <button (click)="openIntakeModal()" class="er-btn er-btn-primary">
          New Patient Registration
        </button>
      </div>

      <!-- Filter Pills Bar -->
      <div class="filters-bar er-card">
        <div class="filter-pills">
          <button (click)="setAcuityFilter(null)" class="pill-btn" [class.active]="selectedAcuity === null">
            All Patients
          </button>

          <button (click)="setAcuityFilter(1)" class="pill-btn esi-1" [class.active]="selectedAcuity === 1">
            Level 1 (Critical)
          </button>
          <button (click)="setAcuityFilter(2)" class="pill-btn esi-2" [class.active]="selectedAcuity === 2">
            Level 2 (Emergency)
          </button>

          <button (click)="setAcuityFilter(3)" class="pill-btn esi-3" [class.active]="selectedAcuity === 3">
            Level 3 (Urgent)
          </button>

          <button (click)="setAcuityFilter(4)" class="pill-btn esi-4" [class.active]="selectedAcuity === 4">
            Level 4 (Standard)
          </button>

          <button (click)="setAcuityFilter(5)" class="pill-btn esi-5" [class.active]="selectedAcuity === 5">
            Level 5 (Low Priority)
          </button>
        </div>

        <div class="search-box">
          <input type="text" [(ngModel)]="searchQuery" (input)="loadPatients()" placeholder="Search by name or MRN...">
        </div>
      </div>

      <!-- Active Patient Queue -->
      <div class="er-card">
        <div class="er-table-wrapper">
          <table class="er-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Patient Name & MRN</th>
                <th>Arrival</th>
                <th>Vital Signs</th>
                <th>Reason for Visit</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let p of patients">
                <td>
                  <span class="acuity-badge" [ngClass]="'esi-' + p.acuity_level">
                    Level {{ p.acuity_level }}
                  </span>
                </td>
                <td>
                  <strong>{{ p.first_name }} {{ p.last_name }}</strong>
                  <div style="font-size: 0.75rem; color: var(--text-dim);">MRN: {{ p.mrn }} • {{ p.age }}y/o {{ p.gender }}</div>
                </td>
                <td>
                  <span class="arrival-pill" [class.ambulance]="p.arrival_mode === 'ambulance'">
                    {{ p.arrival_mode.replace('_', ' ').toUpperCase() }}
                  </span>
                </td>
                <td>
                  <div *ngIf="p.latest_vitals; else noVitals" class="vitals-grid">
                    <span [class.vital-warn]="(p.latest_vitals.heart_rate || 0) > 100">HR: {{ p.latest_vitals.heart_rate || '-' }}</span>
                    <span>BP: {{ p.latest_vitals.bp_systolic || '-' }}/{{ p.latest_vitals.bp_diastolic || '-' }}</span>
                    <span [class.vital-alert]="(p.latest_vitals.spo2 || 100) < 94">SpO2: {{ p.latest_vitals.spo2 || '-' }}%</span>
                  </div>
                  <ng-template #noVitals>
                    <span style="color: var(--text-dim); font-size: 0.8rem;">No vitals</span>
                  </ng-template>
                </td>
                <td style="max-width: 250px;">{{ p.chief_complaint }}</td>
                <td>
                  <span class="status-pill status-occupied">
                    {{ p.status.replace('_', ' ').toUpperCase() }}
                  </span>
                </td>
                <td>
                  <button (click)="openAssignDoctorModal(p)" class="er-btn er-btn-secondary er-btn-sm">
                    Assign Doctor
                  </button>
                </td>
              </tr>
              <tr *ngIf="patients.length === 0">
                <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">
                  No patients currently waiting.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- New Patient Intake Modal -->
      <div class="er-modal-backdrop" *ngIf="showIntakeModal">
        <div class="er-modal-content">
          <div class="er-modal-header">
            <h3>New Patient Intake</h3>
            <button (click)="showIntakeModal = false" class="close-btn">×</button>
          </div>
          <div class="er-modal-body">
            <form (ngSubmit)="submitIntake()">
              <div class="form-grid-2">
                <div class="form-group">
                  <label>Arrival Method *</label>
                  <select [(ngModel)]="intakeForm.arrival_mode" name="arrival_mode" required>
                    <option value="walk_in">Walk-In Arrival</option>
                    <option value="ambulance">Ambulance Arrival</option>
                  </select>
                </div>

                <div class="form-group">
                  <label>Priority Level *</label>
                  <select [(ngModel)]="intakeForm.acuity_level" name="acuity_level" required>
                    <option [ngValue]="1">Level 1 — Critical (Immediate Care Needed)</option>
                    <option [ngValue]="2">Level 2 — Emergency (Very Urgent)</option>
                    <option [ngValue]="3">Level 3 — Urgent (Needs Attention)</option>
                    <option [ngValue]="4">Level 4 — Standard (Minor Care)</option>
                    <option [ngValue]="5">Level 5 — Low Priority (Basic Care)</option>
                  </select>
                </div>
              </div>

              <div class="form-grid-3">
                <div class="form-group">
                  <label>First Name *</label>
                  <input type="text" [(ngModel)]="intakeForm.first_name" name="first_name" required placeholder="First name">
                </div>
                <div class="form-group">
                  <label>Last Name *</label>
                  <input type="text" [(ngModel)]="intakeForm.last_name" name="last_name" required placeholder="Last name">
                </div>
                <div class="form-group">
                  <label>Age *</label>
                  <input type="number" [(ngModel)]="intakeForm.age" name="age" required placeholder="Age">
                </div>
              </div>

              <div class="form-group">
                <label>Reason for Visit / Symptoms *</label>
                <textarea [(ngModel)]="intakeForm.chief_complaint" name="chief_complaint" required placeholder="Describe symptoms or reason for visit..."></textarea>
              </div>

              <h4 style="margin: 16px 0 10px; font-size: 0.9rem; color: var(--text-muted);">Initial Vitals (Optional)</h4>
              <div class="form-grid-3">
                <div class="form-group">
                  <label>Heart Rate (bpm)</label>
                  <input type="number" [(ngModel)]="vitalsForm.heart_rate" name="heart_rate" placeholder="e.g. 80">
                </div>
                <div class="form-group">
                  <label>BP Systolic (mmHg)</label>
                  <input type="number" [(ngModel)]="vitalsForm.bp_systolic" name="bp_systolic" placeholder="e.g. 120">
                </div>
                <div class="form-group">
                  <label>SpO2 (%)</label>
                  <input type="number" [(ngModel)]="vitalsForm.spo2" name="spo2" placeholder="e.g. 98">
                </div>
              </div>

              <div class="er-modal-footer" style="padding-right: 0; padding-left: 0;">
                <button type="button" (click)="showIntakeModal = false" class="er-btn er-btn-secondary">Cancel</button>
                <button type="submit" class="er-btn er-btn-primary">Register Patient</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- Assign Doctor Modal -->
      <div class="er-modal-backdrop" *ngIf="selectedPatientForDoctor">
        <div class="er-modal-content">
          <div class="er-modal-header">
            <h3>Assign Doctor</h3>
            <button (click)="selectedPatientForDoctor = null" class="close-btn">×</button>
          </div>
          <div class="er-modal-body">
            <p style="margin-bottom: 14px;">Select a doctor for <strong>{{ selectedPatientForDoctor.first_name }} {{ selectedPatientForDoctor.last_name }}</strong> (MRN: {{ selectedPatientForDoctor.mrn }}):</p>
            <div class="form-group">
              <label>Available Doctors</label>
              <select [(ngModel)]="targetDoctorId">
                <option *ngFor="let doc of erDoctors" [value]="doc.id">
                  {{ doc.full_name }} — {{ doc.specialty }} [{{ doc.status.toUpperCase() }}]
                </option>
              </select>
            </div>
          </div>
          <div class="er-modal-footer">
            <button (click)="selectedPatientForDoctor = null" class="er-btn er-btn-secondary">Cancel</button>
            <button (click)="submitAssignDoctor()" class="er-btn er-btn-primary">Confirm Doctor</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .triage-container { display: flex; flex-direction: column; gap: 20px; }
    .header-bar { display: flex; justify-content: space-between; align-items: center; }
    .header-bar h2 { font-size: 1.5rem; font-weight: 800; color: #111827; }
    .filters-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 20px;
      .filter-pills { display: flex; gap: 8px; flex-wrap: wrap; }
      .pill-btn {
        padding: 6px 14px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-color);
        background-color: var(--bg-input);
        color: var(--text-muted);
        font-weight: 600;
        font-size: 0.8rem;
        cursor: pointer;
        &.active { background-color: var(--pq-brand-primary); color: #fff; border-color: var(--pq-brand-primary); }
      }
      .search-box input {
        min-height: 40px;
        padding: 8px 14px;
        border-radius: var(--radius-md);
        border: 1px solid var(--border-color);
        background-color: var(--bg-input);
        color: var(--text-main);
      }
    }
    .arrival-pill {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      background-color: #f1f5f9;
      &.ambulance { background-color: #fef2f2; color: #ef4444; border: 1px solid #fca5a5; }
    }
    .vitals-grid {
      display: flex; flex-direction: column; gap: 2px; font-size: 0.78rem; font-family: var(--font-mono);
      .vital-warn { color: #d97706; font-weight: 700; }
      .vital-alert { color: #dc2626; font-weight: 800; }
    }
  `]
})
export class TriageComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly realtime = inject(EmergencyRealtimeService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  patients: Patient[] = [];
  erDoctors: Doctor[] = [];
  selectedAcuity: number | null = null;
  searchQuery = '';

  showIntakeModal = false;
  selectedPatientForDoctor: Patient | null = null;
  targetDoctorId = '';

  intakeForm = {
    first_name: '',
    last_name: '',
    age: 40,
    gender: 'male',
    arrival_mode: 'walk_in',
    chief_complaint: '',
    acuity_level: 3
  };

  vitalsForm = {
    heart_rate: undefined,
    bp_systolic: undefined,
    bp_diastolic: undefined,
    spo2: undefined
  };

  private readonly loadPatients$ = new Subject<void>();
  private readonly loadDoctors$ = new Subject<void>();
  private sub?: Subscription;

  ngOnInit(): void {
    this.sub = new Subscription();

    this.sub.add(
      this.loadPatients$.pipe(
        switchMap(() => this.api.getPatients({
          status_filter: 'active',
          acuity_filter: this.selectedAcuity || undefined,
          search: this.searchQuery || undefined
        }))
      ).subscribe(data => {
        this.patients = data;
        this.cdr.markForCheck();
      })
    );

    this.sub.add(
      this.loadDoctors$.pipe(
        switchMap(() => this.api.getDoctors())
      ).subscribe(docs => {
        this.erDoctors = docs;
        if (docs.length > 0 && !this.targetDoctorId) this.targetDoctorId = docs[0].id;
        this.cdr.markForCheck();
      })
    );

    this.loadPatients();
    this.loadDoctors();
    this.subscribeRealtime();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  setAcuityFilter(level: number | null): void {
    this.selectedAcuity = level;
    this.loadPatients();
  }

  loadPatients(): void {
    this.loadPatients$.next();
  }

  loadDoctors(): void {
    this.loadDoctors$.next();
  }

  private subscribeRealtime(): void {
    const room = `hospital_${this.auth.getHospitalId()}`;
    this.sub?.add(
      this.realtime.connect(room).subscribe(rawMsg => {
        const event = unwrapErRealtimeEvent(rawMsg);
        if (!event) return;

        if (['er_patient_created', 'er_patient_triaged', 'er_patient_updated', 'er_doctor_status_updated'].includes(event.eventType)) {
          this.loadPatients();
          this.loadDoctors();
        }
      })
    );
  }

  openIntakeModal(): void {
    this.showIntakeModal = true;
  }

  submitIntake(): void {
    const name = `${this.intakeForm.first_name} ${this.intakeForm.last_name}`;
    const payload = {
      ...this.intakeForm,
      vitals: (this.vitalsForm.heart_rate || this.vitalsForm.bp_systolic || this.vitalsForm.spo2) ? this.vitalsForm : null
    };

    this.api.createRapidTriage(payload).subscribe(() => {
      this.toast.success('Patient Registered', `${name} added to intake queue`);
      this.showIntakeModal = false;
      this.loadPatients();
    });
  }

  openAssignDoctorModal(p: Patient): void {
    this.selectedPatientForDoctor = p;
    this.loadDoctors();
  }

  submitAssignDoctor(): void {
    if (!this.selectedPatientForDoctor || !this.targetDoctorId) return;
    const patientName = `${this.selectedPatientForDoctor.first_name} ${this.selectedPatientForDoctor.last_name}`;
    this.api.assignDoctor(this.selectedPatientForDoctor.id, this.targetDoctorId).subscribe(() => {
      this.toast.success('Doctor Assigned', `Attending doctor assigned to ${patientName}`);
      this.selectedPatientForDoctor = null;
      this.loadPatients();
      this.loadDoctors();
    });
  }
}
