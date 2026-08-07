import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { EmergencyRealtimeService, unwrapErRealtimeEvent } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/services/toast.service';
import { Bed, Patient, Resource } from '../../../core/models/emergency.models';

@Component({
  selector: 'app-bed-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="bed-board-container">
      <div class="header-bar">
        <div>
          <h2>Beds & Equipment Status</h2>
          <p>Track room occupancy, bed cleaning, and equipment availability</p>
        </div>

        <div class="section-tabs">
          <button (click)="setSectionFilter(null)" class="tab-btn" [class.active]="selectedSection === null">
            All Beds ({{ beds.length }})
          </button>
          <button (click)="setSectionFilter('trauma_bay')" class="tab-btn" [class.active]="selectedSection === 'trauma_bay'">
            Trauma Bays
          </button>
          <button (click)="setSectionFilter('resuscitation')" class="tab-btn" [class.active]="selectedSection === 'resuscitation'">
            Resuscitation
          </button>
          <button (click)="setSectionFilter('main_er')" class="tab-btn" [class.active]="selectedSection === 'main_er'">
            Main ER
          </button>
          <button (click)="setSectionFilter('isolation')" class="tab-btn" [class.active]="selectedSection === 'isolation'">
            Isolation
          </button>
        </div>
      </div>

      <!-- Bed Cards Grid -->
      <div class="beds-grid">
        <div *ngFor="let bed of beds" class="bed-card" [ngClass]="'status-' + bed.status">
          <div class="bed-header">
            <span class="bed-code">{{ bed.bed_code }}</span>
            <span class="status-pill" [ngClass]="'status-' + bed.status">
              {{ bed.status.toUpperCase() }}
            </span>
          </div>

          <div class="bed-section-tag">
            {{ formatSection(bed.section) }}
          </div>

          <div class="bed-body">
            <div *ngIf="bed.assigned_patient_id; else unassignedState" class="occupied-info">
              <span class="patient-name">{{ bed.patient_name || 'Assigned Patient' }}</span>
              <span *ngIf="bed.acuity_level" class="acuity-badge" [ngClass]="'esi-' + bed.acuity_level">
                Level {{ bed.acuity_level }}
              </span>
            </div>
            <ng-template #unassignedState>
              <div class="empty-info">
                <span>Available</span>
              </div>
            </ng-template>
          </div>

          <div class="bed-footer">
            <button *ngIf="bed.status === 'empty'" (click)="openAssignModal(bed)" class="er-btn er-btn-primary er-btn-sm" style="width: 100%;">
              Assign Patient
            </button>
            <button *ngIf="bed.status === 'cleaning'" (click)="markBedReady(bed)" class="er-btn er-btn-success er-btn-sm" style="width: 100%;">
              Mark Clean & Ready
            </button>
            <button *ngIf="bed.status === 'occupied'" (click)="openAssignModal(bed)" class="er-btn er-btn-secondary er-btn-sm" style="width: 100%;">
              Manage / Clear Bed
            </button>
          </div>
        </div>
      </div>

      <!-- Equipment & Resources -->
      <div class="resources-section er-card">
        <div class="card-header">
          <h3>Equipment & Resources</h3>
          <span style="font-size: 0.85rem; color: var(--text-muted);">Current Availability</span>
        </div>

        <div class="resources-grid">
          <div *ngFor="let res of resources" class="resource-card">
            <div class="res-info">
              <strong>{{ res.resource_name }}</strong>
              <span class="res-type">{{ res.resource_type.toUpperCase() }} • {{ res.current_location || 'ER Main' }}</span>
            </div>
            <div class="res-controls">
              <span class="status-pill" [class.status-empty]="res.status === 'available'" [class.status-occupied]="res.status === 'in_use'" [class.status-cleaning]="res.status === 'maintenance'">
                {{ res.status.toUpperCase() }}
              </span>
              <button (click)="toggleResourceStatus(res)" class="er-btn er-btn-secondary er-btn-sm">
                Change Status
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Assign / Manage Bed Modal -->
      <div class="er-modal-backdrop" *ngIf="targetBed">
        <div class="er-modal-content">
          <div class="er-modal-header">
            <h3>Manage Bed {{ targetBed.bed_code }}</h3>
            <button (click)="targetBed = null" class="close-btn">×</button>
          </div>
          <div class="er-modal-body">
            <p style="margin-bottom: 16px;">
              Bed <strong>{{ targetBed.bed_code }}</strong> ({{ formatSection(targetBed.section) }}) — Currently <strong>{{ targetBed.status.toUpperCase() }}</strong>
            </p>

            <div class="form-group" *ngIf="unassignedPatients.length > 0">
              <label>Select Patient to Assign / Reassign</label>
              <select [(ngModel)]="selectedPatientId">
                <option *ngFor="let p of unassignedPatients" [value]="p.id">
                  [Level {{ p.acuity_level }}] {{ p.first_name }} {{ p.last_name }} (MRN: {{ p.mrn }})
                </option>
              </select>
            </div>

            <div *ngIf="unassignedPatients.length === 0" style="padding: 12px; background: #f3f4f6; border-radius: 8px; margin-bottom: 16px; font-size: 0.88rem; color: var(--text-muted);">
              No unassigned active patients currently waiting.
            </div>
          </div>
          <div class="er-modal-footer">
            <button (click)="targetBed = null" class="er-btn er-btn-secondary">Cancel</button>
            <button *ngIf="targetBed.status === 'occupied'" (click)="clearBed()" class="er-btn er-btn-warning">Clear & Mark Cleaning</button>
            <button (click)="submitAssignBed()" [disabled]="!selectedPatientId" class="er-btn er-btn-primary">Assign Patient</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .bed-board-container { display: flex; flex-direction: column; gap: 24px; }
    .header-bar {
      display: flex; justify-content: space-between; align-items: center;
      h2 { font-size: 1.5rem; font-weight: 800; color: #111827; }
      .section-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
      .tab-btn {
        padding: 8px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-color);
        background-color: var(--bg-card); color: var(--text-muted); font-weight: 600; font-size: 0.85rem; cursor: pointer;
        &.active { background-color: var(--pq-brand-primary); color: #fff; border-color: var(--pq-brand-primary); }
      }
    }
    .beds-grid {
      display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px;
      @media (max-width: 1200px) { grid-template-columns: repeat(3, 1fr); }
      @media (max-width: 768px) { grid-template-columns: repeat(2, 1fr); }
      @media (max-width: 480px) { grid-template-columns: 1fr; }
    }
    .bed-card {
      background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg);
      padding: 16px; display: flex; flex-direction: column; gap: 12px; transition: all 0.15s ease;
      &.status-occupied { border-color: #fca5a5; background-color: #fff; }
      &.status-empty { border-color: #a7f3d0; background-color: #fff; }
      &.status-cleaning { border-color: #fde68a; background-color: #fff; }
    }
    .bed-header { display: flex; justify-content: space-between; align-items: center; }
    .bed-code { font-weight: 800; font-size: 1.05rem; font-family: var(--font-mono); }
    .bed-section-tag { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; }
    .bed-body {
      flex: 1; min-height: 48px; display: flex; flex-direction: column; justify-content: center;
      .patient-name { font-weight: 700; font-size: 0.95rem; margin-bottom: 4px; display: block; }
      .empty-info { color: #059669; font-size: 0.85rem; font-weight: 600; }
    }
    .resources-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 14px;
      @media (max-width: 900px) { grid-template-columns: 1fr; }
    }
    .resource-card {
      padding: 14px; background-color: #f9fafb; border-radius: var(--radius-md); border: 1px solid var(--border-color);
      display: flex; justify-content: space-between; align-items: center;
      .res-info { display: flex; flex-direction: column; gap: 2px; }
      .res-type { font-size: 0.75rem; color: var(--text-muted); }
      .res-controls { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    }
  `]
})
export class BedBoardComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly realtime = inject(EmergencyRealtimeService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  beds: Bed[] = [];
  resources: Resource[] = [];
  unassignedPatients: Patient[] = [];
  selectedSection: string | null = null;

  targetBed: Bed | null = null;
  selectedPatientId = '';

  private readonly loadBeds$ = new Subject<void>();
  private readonly loadResources$ = new Subject<void>();
  private sub?: Subscription;

  ngOnInit(): void {
    this.sub = new Subscription();

    this.sub.add(
      this.loadBeds$.pipe(
        switchMap(() => this.api.getBeds(this.selectedSection || undefined))
      ).subscribe(data => {
        this.beds = data;
        this.cdr.markForCheck();
      })
    );

    this.sub.add(
      this.loadResources$.pipe(
        switchMap(() => this.api.getResources())
      ).subscribe(data => {
        this.resources = data;
        this.cdr.markForCheck();
      })
    );

    this.loadBeds();
    this.loadResources();
    this.subscribeRealtime();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  setSectionFilter(section: string | null): void {
    this.selectedSection = section;
    this.loadBeds();
  }

  loadBeds(): void {
    this.loadBeds$.next();
  }

  loadResources(): void {
    this.loadResources$.next();
  }

  private subscribeRealtime(): void {
    const room = `hospital_${this.auth.getHospitalId()}`;
    this.sub?.add(
      this.realtime.connect(room).subscribe(rawMsg => {
        const event = unwrapErRealtimeEvent(rawMsg);
        if (!event) return;

        if (['er_bed_updated', 'er_patient_assigned_bed', 'er_resource_updated', 'er_patient_discharged'].includes(event.eventType)) {
          this.loadBeds();
          this.loadResources();
        }
      })
    );
  }

  formatSection(section: string): string {
    return (section || '').replace('_', ' ').toUpperCase();
  }

  openAssignModal(bed: Bed): void {
    this.targetBed = bed;
    this.selectedPatientId = '';
    this.api.getPatients({ status_filter: 'active' }).subscribe(patients => {
      this.unassignedPatients = patients.filter(p => !p.assigned_bed_id);
      if (this.unassignedPatients.length > 0) {
        this.selectedPatientId = this.unassignedPatients[0].id;
      }
      this.cdr.markForCheck();
    });
  }

  submitAssignBed(): void {
    if (!this.targetBed || !this.selectedPatientId) return;
    const bedCode = this.targetBed.bed_code;
    this.api.assignBed(this.selectedPatientId, this.targetBed.id).subscribe(() => {
      this.toast.success('Bed Assigned', `Patient assigned to ${bedCode}`);
      this.targetBed = null;
      this.loadBeds();
    });
  }

  clearBed(): void {
    if (!this.targetBed) return;
    const bedCode = this.targetBed.bed_code;
    this.api.updateBedStatus(this.targetBed.id, 'cleaning').subscribe(() => {
      this.toast.info('Bed Cleared', `${bedCode} cleared and marked for cleaning`);
      this.targetBed = null;
      this.loadBeds();
    });
  }

  markBedReady(bed: Bed): void {
    this.api.updateBedStatus(bed.id, 'empty').subscribe(() => {
      this.toast.success('Bed Ready', `${bed.bed_code} marked clean & ready for patients`);
      this.loadBeds();
    });
  }

  toggleResourceStatus(res: Resource): void {
    const nextStatus = res.status === 'available' ? 'in_use' : res.status === 'in_use' ? 'maintenance' : 'available';
    this.api.updateResourceStatus(res.id, nextStatus).subscribe(() => {
      this.toast.info('Resource Status Updated', `${res.resource_name} is now ${nextStatus.replace('_', ' ').toUpperCase()}`);
      this.loadResources();
    });
  }
}
