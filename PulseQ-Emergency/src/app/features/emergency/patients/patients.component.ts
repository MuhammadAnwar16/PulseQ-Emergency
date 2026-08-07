import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { EmergencyRealtimeService, unwrapErRealtimeEvent } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/services/toast.service';
import { Patient, VitalsLog } from '../../../core/models/emergency.models';

@Component({
  selector: 'app-patients',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="patients-container">
      <div class="header-bar">
        <div>
          <h2>Patients List & Reports</h2>
          <p>View patient records, add vital signs, and download discharge summaries</p>
        </div>
      </div>

      <!-- Filters & Search -->
      <div class="filters-bar er-card">
        <div class="status-tabs">
          <button (click)="setStatusFilter('active')" class="tab-btn" [class.active]="statusFilter === 'active'">
            Active Patients
          </button>
          <button (click)="setStatusFilter('discharged')" class="tab-btn" [class.active]="statusFilter === 'discharged'">
            Discharged Patients
          </button>
          <button (click)="setStatusFilter('')" class="tab-btn" [class.active]="statusFilter === ''">
            All Records
          </button>
        </div>

        <div class="search-box">
          <input type="text" [(ngModel)]="searchQuery" (input)="loadPatients()" placeholder="Search name or MRN...">
        </div>
      </div>

      <!-- Patient List Table -->
      <div class="er-card">
        <div class="er-table-wrapper">
          <table class="er-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Patient Name & MRN</th>
                <th>Age / Gender</th>
                <th>Reason for Visit</th>
                <th>Recent Vitals</th>
                <th>Status</th>
                <th>Actions</th>
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
                  <div style="font-size: 0.75rem; color: var(--text-dim);">MRN: {{ p.mrn }}</div>
                </td>
                <td>{{ p.age }} y/o • <span style="text-transform: capitalize;">{{ p.gender }}</span></td>
                <td style="max-width: 240px;">{{ p.chief_complaint }}</td>
                <td>
                  <div *ngIf="p.latest_vitals; else noVitals" class="vitals-grid">
                    <span>HR: {{ p.latest_vitals.heart_rate || '-' }} | BP: {{ p.latest_vitals.bp_systolic || '-' }}/{{ p.latest_vitals.bp_diastolic || '-' }}</span>
                    <span>SpO2: {{ p.latest_vitals.spo2 || '-' }}% | Pain: {{ p.latest_vitals.pain_score !== undefined ? p.latest_vitals.pain_score + '/10' : '-' }}</span>
                  </div>
                  <ng-template #noVitals>
                    <span style="color: var(--text-dim); font-size: 0.8rem;">No vitals</span>
                  </ng-template>
                </td>
                <td>
                  <span class="status-pill" [class.status-occupied]="p.status !== 'discharged'" [class.status-empty]="p.status === 'discharged'">
                    {{ p.status.replace('_', ' ').toUpperCase() }}
                  </span>
                </td>
                <td>
                  <div class="action-btns">
                    <button (click)="openVitalsModal(p)" class="er-btn er-btn-secondary er-btn-sm" title="Add Vitals">
                      Add Vitals
                    </button>
                    <a [href]="api.getPatientPdfUrl(p.id)" target="_blank" (click)="onDownloadPdf(p)" class="er-btn er-btn-primary er-btn-sm" title="PDF Summary">
                      PDF Summary
                    </a>
                    <button *ngIf="p.status !== 'discharged'" (click)="openDischargeModal(p)" class="er-btn er-btn-warning er-btn-sm" title="Discharge Patient">
                      Discharge
                    </button>
                  </div>
                </td>
              </tr>
              <tr *ngIf="patients.length === 0">
                <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">
                  No patient records found.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Add Vitals Modal -->
      <div class="er-modal-backdrop" *ngIf="selectedPatientForVitals">
        <div class="er-modal-content">
          <div class="er-modal-header">
            <h3>Add Vitals for {{ selectedPatientForVitals.first_name }} {{ selectedPatientForVitals.last_name }}</h3>
            <button (click)="selectedPatientForVitals = null" class="close-btn">×</button>
          </div>
          <div class="er-modal-body">
            <form (ngSubmit)="submitVitals()">
              <div class="form-grid-3">
                <div class="form-group">
                  <label>Heart Rate (bpm)</label>
                  <input type="number" [(ngModel)]="vitalsForm.heart_rate" name="heart_rate" placeholder="e.g. 85">
                </div>
                <div class="form-group">
                  <label>BP Systolic (mmHg)</label>
                  <input type="number" [(ngModel)]="vitalsForm.bp_systolic" name="bp_systolic" placeholder="e.g. 120">
                </div>
                <div class="form-group">
                  <label>BP Diastolic (mmHg)</label>
                  <input type="number" [(ngModel)]="vitalsForm.bp_diastolic" name="bp_diastolic" placeholder="e.g. 80">
                </div>
              </div>

              <div class="form-grid-3">
                <div class="form-group">
                  <label>SpO2 (%)</label>
                  <input type="number" [(ngModel)]="vitalsForm.spo2" name="spo2" placeholder="e.g. 98">
                </div>
                <div class="form-group">
                  <label>Temp (°C)</label>
                  <input type="number" step="0.1" [(ngModel)]="vitalsForm.temp_c" name="temp_c" placeholder="e.g. 37.0">
                </div>
                <div class="form-group">
                  <label>Pain Scale (0-10)</label>
                  <input type="number" min="0" max="10" [(ngModel)]="vitalsForm.pain_score" name="pain_score" placeholder="0-10">
                </div>
              </div>

              <div class="er-modal-footer" style="padding-left: 0; padding-right: 0;">
                <button type="button" (click)="selectedPatientForVitals = null" class="er-btn er-btn-secondary">Cancel</button>
                <button type="submit" class="er-btn er-btn-primary">Save Vitals</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- Discharge Confirmation Modal -->
      <div class="er-modal-backdrop" *ngIf="selectedPatientForDischarge">
        <div class="er-modal-content">
          <div class="er-modal-header">
            <h3>Confirm Patient Discharge</h3>
            <button (click)="selectedPatientForDischarge = null" class="close-btn">×</button>
          </div>
          <div class="er-modal-body">
            <p style="margin-bottom: 12px; font-size: 0.95rem;">
              Are you sure you want to discharge <strong>{{ selectedPatientForDischarge.first_name }} {{ selectedPatientForDischarge.last_name }}</strong> (MRN: {{ selectedPatientForDischarge.mrn }})?
            </p>
            <p style="font-size: 0.85rem; color: var(--text-muted);">
              Discharging this patient will free up their assigned bed for cleaning and set their assigned doctor back to available.
            </p>
          </div>
          <div class="er-modal-footer">
            <button (click)="selectedPatientForDischarge = null" class="er-btn er-btn-secondary">Cancel</button>
            <button (click)="confirmDischarge()" class="er-btn er-btn-warning">Confirm Discharge</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .patients-container { display: flex; flex-direction: column; gap: 20px; }
    .header-bar { display: flex; justify-content: space-between; align-items: center; }
    .header-bar h2 { font-size: 1.5rem; font-weight: 800; color: #111827; }
    .filters-bar {
      display: flex; justify-content: space-between; align-items: center; padding: 14px 20px;
      .status-tabs { display: flex; gap: 8px; }
      .tab-btn {
        padding: 6px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);
        background-color: var(--bg-input); color: var(--text-muted); font-weight: 600; font-size: 0.8rem; cursor: pointer;
        &.active { background-color: var(--pq-brand-primary); color: #fff; border-color: var(--pq-brand-primary); }
      }
      .search-box input {
        min-height: 40px; padding: 8px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-color);
        background-color: var(--bg-input); color: var(--text-main);
      }
    }
    .vitals-grid { display: flex; flex-direction: column; font-size: 0.78rem; font-family: var(--font-mono); color: var(--text-muted); }
    .action-btns { display: flex; gap: 6px; flex-wrap: wrap; }
  `]
})
export class PatientsComponent implements OnInit, OnDestroy {
  readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly realtime = inject(EmergencyRealtimeService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  patients: Patient[] = [];
  statusFilter = 'active';
  searchQuery = '';

  selectedPatientForVitals: Patient | null = null;
  selectedPatientForDischarge: Patient | null = null;

  vitalsForm: VitalsLog = {
    heart_rate: undefined,
    bp_systolic: undefined,
    bp_diastolic: undefined,
    spo2: undefined,
    temp_c: undefined,
    pain_score: undefined
  };

  private readonly loadPatients$ = new Subject<void>();
  private sub?: Subscription;

  ngOnInit(): void {
    this.sub = new Subscription();

    this.sub.add(
      this.loadPatients$.pipe(
        switchMap(() => this.api.getPatients({
          status_filter: this.statusFilter || undefined,
          search: this.searchQuery || undefined
        }))
      ).subscribe(data => {
        this.patients = data;
        this.cdr.markForCheck();
      })
    );

    this.loadPatients();
    this.subscribeRealtime();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  setStatusFilter(status: string): void {
    this.statusFilter = status;
    this.loadPatients();
  }

  loadPatients(): void {
    this.loadPatients$.next();
  }

  private subscribeRealtime(): void {
    const room = `hospital_${this.auth.getHospitalId()}`;
    this.sub?.add(
      this.realtime.connect(room).subscribe(rawMsg => {
        const event = unwrapErRealtimeEvent(rawMsg);
        if (!event) return;

        if (['er_patient_created', 'er_patient_updated', 'er_vitals_logged', 'er_patient_discharged'].includes(event.eventType)) {
          this.loadPatients();
        }
      })
    );
  }

  openVitalsModal(p: Patient): void {
    this.selectedPatientForVitals = p;
    this.vitalsForm = {
      heart_rate: p.latest_vitals?.heart_rate,
      bp_systolic: p.latest_vitals?.bp_systolic,
      bp_diastolic: p.latest_vitals?.bp_diastolic,
      spo2: p.latest_vitals?.spo2,
      temp_c: p.latest_vitals?.temp_c,
      pain_score: p.latest_vitals?.pain_score
    };
  }

  submitVitals(): void {
    if (!this.selectedPatientForVitals) return;
    const p = this.selectedPatientForVitals;
    this.api.logVitals(p.id, this.vitalsForm).subscribe(() => {
      this.toast.success('Vitals Saved', `Vitals updated for ${p.first_name} ${p.last_name}`);
      this.selectedPatientForVitals = null;
      this.loadPatients();
    });
  }

  openDischargeModal(p: Patient): void {
    this.selectedPatientForDischarge = p;
  }

  confirmDischarge(): void {
    if (!this.selectedPatientForDischarge) return;
    const p = this.selectedPatientForDischarge;
    this.api.dischargePatient(p.id).subscribe(() => {
      this.toast.success('Patient Discharged', `${p.first_name} ${p.last_name} has been discharged`);
      this.selectedPatientForDischarge = null;
      this.loadPatients();
    });
  }

  onDownloadPdf(p: Patient): void {
    this.toast.info('Downloading Report', `Generating discharge PDF for ${p.first_name} ${p.last_name}...`);
  }
}
