import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { EmergencyRealtimeService, unwrapErRealtimeEvent } from '../../../core/services/realtime.service';
import { DashboardMetrics, CriticalAlert, Patient } from '../../../core/models/emergency.models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="dashboard-container">
      <!-- Command Bar -->
      <div class="command-bar">
        <div>
          <h2 class="page-title">Emergency Department Status</h2>
          <p class="page-subtitle">Live real-time monitoring, bed occupancy, and acuity triage</p>
        </div>

        <div class="command-controls">
          <a routerLink="/emergency/triage" class="er-btn er-btn-primary">
            Patient Intake
          </a>
          <a routerLink="/emergency/critical-alerts" class="er-btn er-btn-alert-pulse">
            Emergency Alert
          </a>
        </div>
      </div>

      <!-- Key Metrics Row -->
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-info">
            <span class="metric-label">Active ER Patients</span>
            <span class="metric-val">{{ metrics?.total_active_patients || 0 }}</span>
          </div>
        </div>

        <div class="metric-card alert-card" [class.has-alerts]="getActiveAlertsCount() > 0">
          <div class="metric-info">
            <span class="metric-label">Critical Alerts</span>
            <span class="metric-val">{{ getActiveAlertsCount() }}</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-info">
            <span class="metric-label">Available Beds</span>
            <span class="metric-val">{{ getAvailableBedsCount() }} / {{ metrics?.beds_total_count || metrics?.total_beds || 0 }}</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-info">
            <span class="metric-label">Available Doctors</span>
            <span class="metric-val">{{ metrics?.available_doctors || 0 }} / {{ metrics?.total_doctors || 0 }}</span>
          </div>
        </div>
      </div>

      <!-- Acuity Triage Distribution -->
      <div class="acuity-overview">
        <h3 class="section-title">Emergency Severity Index (ESI) Overview</h3>
        <div class="acuity-grid">
          <div class="acuity-card esi-1">
            <div class="esi-header">
              <span class="esi-title">ESI 1 — Resuscitation</span>
              <span class="esi-count">{{ getAcuityCount(1) }}</span>
            </div>
            <span class="esi-desc">Immediate life-saving intervention</span>
          </div>

          <div class="acuity-card esi-2">
            <div class="esi-header">
              <span class="esi-title">ESI 2 — Emergency</span>
              <span class="esi-count">{{ getAcuityCount(2) }}</span>
            </div>
            <span class="esi-desc">High risk, severe pain, lethargy</span>
          </div>

          <div class="acuity-card esi-3">
            <div class="esi-header">
              <span class="esi-title">ESI 3 — Urgent</span>
              <span class="esi-count">{{ getAcuityCount(3) }}</span>
            </div>
            <span class="esi-desc">Multiple resources needed</span>
          </div>

          <div class="acuity-card esi-4">
            <div class="esi-header">
              <span class="esi-title">ESI 4 — Less Urgent</span>
              <span class="esi-count">{{ getAcuityCount(4) }}</span>
            </div>
            <span class="esi-desc">Single resource needed</span>
          </div>

          <div class="acuity-card esi-5">
            <div class="esi-header">
              <span class="esi-title">ESI 5 — Non-Urgent</span>
              <span class="esi-count">{{ getAcuityCount(5) }}</span>
            </div>
            <span class="esi-desc">No resources needed</span>
          </div>
        </div>
      </div>

      <!-- Tables Grid: Critical Alerts & High Priority Patients -->
      <div class="dash-tables-grid">
        <!-- Active Critical Alerts -->
        <div class="er-card">
          <div class="card-header">
            <h3>Active Emergency Alerts</h3>
            <a routerLink="/emergency/critical-alerts" class="link-btn">View All</a>
          </div>

          <div *ngIf="activeAlerts.length === 0" class="empty-state">
            No active emergency code alerts.
          </div>

          <div *ngFor="let alert of activeAlerts" class="alert-item">
            <div class="alert-badge" [ngClass]="alert.alert_type">
              {{ formatAlertType(alert.alert_type) }}
            </div>
            <div class="alert-details">
              <strong>Location: {{ alert.location_bed_code || 'ER Main' }}</strong>
              <span>Sent by {{ alert.triggered_by_name || 'Nurse' }} • {{ alert.triggered_at | date:'shortTime' }}</span>
            </div>
            <a routerLink="/emergency/critical-alerts" class="er-btn er-btn-secondary er-btn-sm">
              Dispatch
            </a>
          </div>
        </div>

        <!-- High Priority Patients (ESI 1 & 2) -->
        <div class="er-card">
          <div class="card-header">
            <h3>High Priority Patients (ESI 1 & 2)</h3>
            <a routerLink="/emergency/triage" class="link-btn">View All Queue</a>
          </div>

          <div class="er-table-wrapper">
            <table class="er-table">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Patient Name</th>
                  <th>Arrival</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let p of highPriorityPatients">
                  <td>
                    <span class="acuity-badge" [ngClass]="'esi-' + p.acuity_level">
                      Level {{ p.acuity_level }}
                    </span>
                  </td>
                  <td>
                    <strong>{{ p.first_name }} {{ p.last_name }}</strong>
                    <div style="font-size: 0.75rem; color: var(--text-dim);">MRN: {{ p.mrn }}</div>
                  </td>
                  <td style="text-transform: capitalize;">{{ p.arrival_mode.replace('_', ' ') }}</td>
                  <td>
                    <span class="status-pill status-occupied">
                      {{ p.status.replace('_', ' ').toUpperCase() }}
                    </span>
                  </td>
                </tr>
                <tr *ngIf="highPriorityPatients.length === 0">
                  <td colspan="4" style="text-align: center; padding: 20px; color: var(--text-muted);">
                    No ESI 1 or ESI 2 patients currently waiting.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container { display: flex; flex-direction: column; gap: 24px; }
    .command-bar {
      display: flex; align-items: center; justify-content: space-between;
      .page-title { font-size: 1.5rem; font-weight: 800; color: #111827; }
      .page-subtitle { color: var(--text-muted); font-size: 0.88rem; margin-top: 2px; }
      .command-controls { display: flex; gap: 12px; }
    }
    .metrics-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
      @media (max-width: 1024px) { grid-template-columns: repeat(2, 1fr); }
      @media (max-width: 640px) { grid-template-columns: 1fr; }
    }
    .metric-card {
      background-color: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg);
      padding: 18px 20px; display: flex; align-items: center; gap: 16px;
      .metric-info { display: flex; flex-direction: column; }
      .metric-label { font-size: 0.8rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }
      .metric-val { font-size: 1.6rem; font-weight: 900; font-family: var(--font-mono); }
      &.alert-card.has-alerts {
        border-color: #ef4444; background: #fef2f2;
        .metric-val { color: #ef4444; }
      }
    }
    .acuity-overview {
      .section-title { font-size: 0.88rem; font-weight: 800; margin-bottom: 12px; color: var(--text-muted); text-transform: uppercase; }
    }
    .acuity-grid {
      display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px;
      @media (max-width: 1024px) { grid-template-columns: repeat(3, 1fr); }
      @media (max-width: 640px) { grid-template-columns: 1fr; }
    }
    .acuity-card {
      padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-color); background-color: var(--bg-card);
      .esi-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
      .esi-title { font-size: 0.82rem; font-weight: 800; }
      .esi-count { font-size: 1.4rem; font-weight: 900; font-family: var(--font-mono); }
      .esi-desc { font-size: 0.75rem; color: var(--text-muted); }
      &.esi-1 { border-color: var(--esi-1-border); background-color: var(--esi-1-bg); .esi-count { color: var(--esi-1); } }
      &.esi-2 { border-color: var(--esi-2-border); background-color: var(--esi-2-bg); .esi-count { color: var(--esi-2); } }
      &.esi-3 { border-color: var(--esi-3-border); background-color: var(--esi-3-bg); .esi-count { color: var(--esi-3); } }
      &.esi-4 { border-color: var(--esi-4-border); background-color: var(--esi-4-bg); .esi-count { color: var(--esi-4); } }
      &.esi-5 { border-color: var(--esi-5-border); background-color: var(--esi-5-bg); .esi-count { color: var(--esi-5); } }
    }
    .dash-tables-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
      @media (max-width: 1024px) { grid-template-columns: 1fr; }
    }
    .card-header {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;
      h3 { font-size: 1.05rem; font-weight: 800; color: #111827; }
      .link-btn { color: var(--pq-brand-primary); font-size: 0.85rem; font-weight: 700; text-decoration: none; }
    }
    .empty-state { text-align: center; padding: 30px; color: var(--text-muted); font-size: 0.9rem; }
    .alert-item {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 12px; border-radius: var(--radius-md); border: 1px solid #fca5a5; background-color: #fef2f2; margin-bottom: 10px;
      .alert-badge {
        padding: 6px 10px; font-weight: 800; font-size: 0.75rem; border-radius: var(--radius-sm); color: #fff; background-color: #ef4444;
      }
      .alert-details { display: flex; flex-direction: column; flex: 1; font-size: 0.85rem; }
    }
  `]
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly realtime = inject(EmergencyRealtimeService);
  private readonly cdr = inject(ChangeDetectorRef);

  metrics: DashboardMetrics | null = null;
  activeAlerts: CriticalAlert[] = [];
  highPriorityPatients: Patient[] = [];

  private readonly loadData$ = new Subject<void>();
  private sub?: Subscription;

  ngOnInit(): void {
    this.sub = new Subscription();

    this.sub.add(
      this.loadData$.pipe(
        switchMap(() => this.api.getDashboardMetrics())
      ).subscribe(data => {
        this.metrics = data;
        this.cdr.markForCheck();
      })
    );

    this.sub.add(
      this.loadData$.pipe(
        switchMap(() => this.api.getCriticalAlerts('active'))
      ).subscribe(data => {
        this.activeAlerts = data;
        this.cdr.markForCheck();
      })
    );

    this.sub.add(
      this.loadData$.pipe(
        switchMap(() => this.api.getPatients({ status_filter: 'active' }))
      ).subscribe(patients => {
        this.highPriorityPatients = patients
          .filter(p => [1, 2].includes(p.acuity_level))
          .slice(0, 5);
        this.cdr.markForCheck();
      })
    );

    this.refreshAllData();
    this.subscribeRealtime();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  refreshAllData(): void {
    this.loadData$.next();
  }

  private subscribeRealtime(): void {
    const room = `hospital_${this.auth.getHospitalId()}`;
    this.sub?.add(
      this.realtime.connect(room).subscribe(rawMsg => {
        const event = unwrapErRealtimeEvent(rawMsg);
        if (!event) return;
        this.refreshAllData();
      })
    );
  }

  formatAlertType(type: string): string {
    return type ? type.replace('_', ' ').toUpperCase() : 'ALERT';
  }

  getActiveAlertsCount(): number {
    if (!this.metrics) return 0;
    return this.metrics.active_alerts_count ?? this.metrics.active_critical_alerts ?? 0;
  }

  getAvailableBedsCount(): number {
    if (!this.metrics) return 0;
    if (this.metrics.available_beds !== undefined) return this.metrics.available_beds;
    const total = this.metrics.beds_total_count || 0;
    const occupied = this.metrics.beds_occupied_count || 0;
    return Math.max(0, total - occupied);
  }

  getAcuityCount(level: number): number {
    if (!this.metrics) return 0;
    if (this.metrics.acuity_breakdown) {
      return this.metrics.acuity_breakdown[level] || this.metrics.acuity_breakdown[String(level)] || 0;
    }
    if (this.metrics.acuity_counts) {
      const key = `level_${level}` as keyof typeof this.metrics.acuity_counts;
      return this.metrics.acuity_counts[key] || 0;
    }
    return 0;
  }
}
