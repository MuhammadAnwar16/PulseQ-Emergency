import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { EmergencyRealtimeService, unwrapErRealtimeEvent } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/services/toast.service';
import { CriticalAlert, Doctor } from '../../../core/models/emergency.models';

@Component({
  selector: 'app-critical-alerts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="alerts-container">
      <div class="header-bar">
        <div>
          <h2>Emergency Code Alerts</h2>
          <p>Send emergency code alerts and dispatch available doctors</p>
        </div>
      </div>

      <!-- Quick Alert Buttons Bar -->
      <div class="trigger-bar er-card">
        <h3 class="bar-title">Send Emergency Alert</h3>
        <div class="code-buttons">
          <button (click)="quickTrigger('code_blue')" class="code-btn code-blue">
            Code Blue
          </button>
          <button (click)="quickTrigger('trauma_alert')" class="code-btn trauma">
            Trauma Alert
          </button>
          <button (click)="quickTrigger('cardiac_arrest')" class="code-btn cardiac">
            Cardiac Arrest
          </button>
          <button (click)="quickTrigger('stroke_alert')" class="code-btn stroke">
            Stroke Alert
          </button>
          <button (click)="quickTrigger('sepsis_alert')" class="code-btn sepsis">
            Severe Sepsis
          </button>
        </div>
      </div>

      <!-- Active Alerts Log -->
      <div class="er-card">
        <div class="card-header">
          <h3>Emergency Alerts Log</h3>
          <div class="status-tabs">
            <button (click)="setStatusFilter('active')" class="tab-btn" [class.active]="selectedStatus === 'active'">
              Active Alerts
            </button>
            <button (click)="setStatusFilter('resolved')" class="tab-btn" [class.active]="selectedStatus === 'resolved'">
              Resolved History
            </button>
          </div>
        </div>

        <div *ngIf="alerts.length === 0" class="empty-state">
          No {{ selectedStatus }} emergency code alerts recorded.
        </div>

        <div *ngFor="let alert of alerts" class="alert-row" [class.critical-border]="alert.status === 'active'">
          <div class="alert-type-badge" [ngClass]="alert.alert_type">
            {{ formatAlertType(alert.alert_type) }}
          </div>

          <div class="alert-main">
            <div class="alert-top">
              <strong>Location: {{ alert.location_bed_code || 'Emergency Dept' }}</strong>
              <span class="alert-time">Triggered: {{ alert.triggered_at | date:'mediumTime' }}</span>
            </div>

            <p class="alert-notes">{{ alert.notes || 'Doctor assistance requested' }}</p>

            <div class="alert-meta">
              <span>Sent by: <strong>{{ alert.triggered_by_name || 'Nurse' }}</strong></span>
              <span *ngIf="alert.dispatched_doctor_name" class="doctor-badge">
                Dispatched Doctor: {{ alert.dispatched_doctor_name }}
              </span>
            </div>
          </div>

          <div class="alert-actions" *ngIf="alert.status !== 'resolved'">
            <button (click)="openDispatchModal(alert)" class="er-btn er-btn-primary er-btn-sm">
              Dispatch Doctor
            </button>
            <button (click)="resolveAlert(alert)" class="er-btn er-btn-success er-btn-sm">
              Resolve Alert
            </button>
          </div>
        </div>
      </div>

      <!-- Dispatch Doctor Modal -->
      <div class="er-modal-backdrop" *ngIf="selectedAlertForDispatch">
        <div class="er-modal-content">
          <div class="er-modal-header">
            <h3>Dispatch Doctor</h3>
            <button (click)="selectedAlertForDispatch = null" class="close-btn">×</button>
          </div>
          <div class="er-modal-body">
            <p style="margin-bottom: 14px;">
              Dispatching doctor for <strong>{{ formatAlertType(selectedAlertForDispatch.alert_type) }}</strong> at {{ selectedAlertForDispatch.location_bed_code || 'ER Main' }}.
            </p>
            <div class="form-group">
              <label>Select Doctor</label>
              <select [(ngModel)]="targetDoctorId">
                <option *ngFor="let doc of erDoctors" [value]="doc.id">
                  {{ doc.full_name }} — {{ doc.specialty }} [{{ doc.status.toUpperCase() }}]
                </option>
              </select>
            </div>
          </div>
          <div class="er-modal-footer">
            <button (click)="selectedAlertForDispatch = null" class="er-btn er-btn-secondary">Cancel</button>
            <button (click)="submitDispatch()" class="er-btn er-btn-primary">Dispatch Doctor Now</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .alerts-container { display: flex; flex-direction: column; gap: 24px; }
    .header-bar h2 { font-size: 1.5rem; font-weight: 800; color: #111827; }
    .trigger-bar {
      padding: 20px;
      .bar-title { font-size: 0.85rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 14px; }
      .code-buttons {
        display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px;
        @media (max-width: 1024px) { grid-template-columns: repeat(3, 1fr); }
        @media (max-width: 640px) { grid-template-columns: 1fr; }
        .code-btn {
          min-height: 50px; font-weight: 700; font-size: 0.88rem; border-radius: var(--radius-md); border: none; color: #fff; cursor: pointer;
          &:active { transform: scale(0.97); }
          &.code-blue { background-color: var(--pq-brand-primary); }
          &.trauma { background-color: #dc2626; }
          &.cardiac { background-color: #b91c1c; }
          &.stroke { background-color: #d97706; }
          &.sepsis { background-color: #7c3aed; }
        }
      }
    }
    .card-header {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;
      h3 { font-size: 1.05rem; font-weight: 800; color: #111827; }
      .status-tabs { display: flex; gap: 8px; }
      .tab-btn {
        padding: 6px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);
        background-color: var(--bg-input); color: var(--text-muted); font-weight: 600; font-size: 0.8rem; cursor: pointer;
        &.active { background-color: var(--pq-brand-primary); color: #fff; border-color: var(--pq-brand-primary); }
      }
    }
    .empty-state { text-align: center; padding: 40px; color: var(--text-muted); }
    .alert-row {
      display: flex; align-items: center; gap: 16px; padding: 16px; background-color: var(--bg-input);
      border-radius: var(--radius-md); border: 1px solid var(--border-color); margin-bottom: 12px;
      &.critical-border { border-color: #ef4444; background: #fef2f2; }
      .alert-type-badge {
        padding: 8px 14px; font-weight: 800; font-size: 0.85rem; border-radius: var(--radius-sm); color: #fff; background-color: #ef4444;
      }
      .alert-main { flex: 1; display: flex; flex-direction: column; gap: 2px; }
      .alert-top { display: flex; justify-content: space-between; font-size: 0.95rem; }
      .alert-time { font-size: 0.78rem; color: var(--text-dim); }
      .alert-notes { font-size: 0.85rem; color: var(--text-muted); }
      .alert-meta { display: flex; gap: 16px; font-size: 0.78rem; color: var(--text-dim); margin-top: 4px; }
      .doctor-badge { color: #059669; font-weight: 700; }
      .alert-actions { display: flex; gap: 8px; }
    }
  `]
})
export class CriticalAlertsComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly realtime = inject(EmergencyRealtimeService);
  private readonly toast = inject(ToastService);
  private readonly cdr = inject(ChangeDetectorRef);

  alerts: CriticalAlert[] = [];
  erDoctors: Doctor[] = [];
  selectedStatus = 'active';

  selectedAlertForDispatch: CriticalAlert | null = null;
  targetDoctorId = '';

  private readonly loadAlerts$ = new Subject<void>();
  private readonly loadDoctors$ = new Subject<void>();
  private sub?: Subscription;

  ngOnInit(): void {
    this.sub = new Subscription();

    this.sub.add(
      this.loadAlerts$.pipe(
        switchMap(() => this.api.getCriticalAlerts(this.selectedStatus))
      ).subscribe(data => {
        this.alerts = data;
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

    this.loadAlerts();
    this.loadDoctors();
    this.subscribeRealtime();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  setStatusFilter(status: string): void {
    this.selectedStatus = status;
    this.loadAlerts();
  }

  loadAlerts(): void {
    this.loadAlerts$.next();
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

        if (['er_alert_triggered', 'er_alert_updated', 'er_alert_resolved', 'er_doctor_status_updated'].includes(event.eventType)) {
          this.loadAlerts();
          this.loadDoctors();
        }
      })
    );
  }

  formatAlertType(type: string): string {
    return (type || '').replace('_', ' ').toUpperCase();
  }

  quickTrigger(type: string): void {
    const formatted = this.formatAlertType(type);
    this.api.triggerCriticalAlert({
      alert_type: type,
      severity: 'critical'
    }).subscribe(() => {
      this.toast.alert('EMERGENCY ALERT SENT', `${formatted} broadcasted to all monitors`);
      this.loadAlerts();
    });
  }

  openDispatchModal(alert: CriticalAlert): void {
    this.selectedAlertForDispatch = alert;
    this.loadDoctors();
  }

  submitDispatch(): void {
    if (!this.selectedAlertForDispatch || !this.targetDoctorId) return;
    const alertType = this.formatAlertType(this.selectedAlertForDispatch.alert_type);
    this.api.dispatchDoctorToAlert(this.selectedAlertForDispatch.id, this.targetDoctorId).subscribe(() => {
      this.toast.success('Doctor Dispatched', `Doctor dispatched to ${alertType}`);
      this.selectedAlertForDispatch = null;
      this.loadAlerts();
      this.loadDoctors();
    });
  }

  resolveAlert(alert: CriticalAlert): void {
    const alertType = this.formatAlertType(alert.alert_type);
    this.api.resolveCriticalAlert(alert.id).subscribe(() => {
      this.toast.success('Alert Resolved', `${alertType} marked resolved`);
      this.loadAlerts();
      this.loadDoctors();
    });
  }
}
