import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { EmergencyRealtimeService, unwrapErRealtimeEvent } from './core/services/realtime.service';
import { ToastService } from './core/services/toast.service';
import { ApiService } from './core/services/api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  template: `
    <div class="er-layout" *ngIf="auth.isLoggedIn(); else unauthLayout">
      <!-- Top Navigation Bar -->
      <header class="er-header">
        <div class="header-brand">
          <div class="brand-title">
            <h1>PULSEQ EMERGENCY</h1>
            <span class="brand-sub">Emergency Portal</span>
          </div>

          <!-- Live WebSocket Connection Indicator -->
          <div class="ws-status-badge" [ngClass]="realtime.connectionStatus()" [title]="'WebSocket Status: ' + realtime.connectionStatus()">
            <span class="status-dot"></span>
            <span class="status-text">{{ realtime.connectionStatus() === 'connected' ? 'LIVE' : realtime.connectionStatus().toUpperCase() }}</span>
          </div>
        </div>

        <nav class="er-nav">
          <a routerLink="/emergency/dashboard" routerLinkActive="active" class="nav-item">
            Dashboard
          </a>
          <a routerLink="/emergency/triage" routerLinkActive="active" class="nav-item">
            Patient Intake
          </a>
          <a routerLink="/emergency/bed-board" routerLinkActive="active" class="nav-item">
            Beds & Rooms
          </a>
          <a routerLink="/emergency/critical-alerts" routerLinkActive="active" class="nav-item alert-nav">
            Emergency Alerts
          </a>
          <a routerLink="/emergency/patients" routerLinkActive="active" class="nav-item">
            Patients List
          </a>
        </nav>

        <div class="header-actions">
          <button (click)="openQuickAlertModal()" class="er-btn er-btn-alert-pulse er-btn-sm">
            Emergency Alert
          </button>

          <button (click)="auth.logout()" class="er-btn er-btn-secondary er-btn-sm" title="Sign Out">
            Sign Out
          </button>
        </div>
      </header>

      <!-- Main Content Area -->
      <main class="er-main-content">
        <router-outlet></router-outlet>
      </main>

      <!-- Floating Toast Notifications -->
      <div class="er-toast-container">
        <div *ngFor="let toast of toastService.toasts()" class="er-toast" [ngClass]="toast.type">
          <div class="toast-header">
            <strong>{{ toast.title }}</strong>
            <button (click)="toastService.dismiss(toast.id)" class="toast-close">×</button>
          </div>
          <p class="toast-msg">{{ toast.message }}</p>
        </div>
      </div>

      <!-- Quick Code Alert Modal -->
      <div class="er-modal-backdrop" *ngIf="showQuickAlert">
        <div class="er-modal-content">
          <div class="er-modal-header">
            <h3 style="color: #ef4444;">Send Emergency Alert</h3>
            <button (click)="showQuickAlert = false" class="close-btn">×</button>
          </div>
          <div class="er-modal-body">
            <p style="margin-bottom: 16px; color: var(--text-muted);">
              Select an emergency code to send an instant alert to the emergency team.
            </p>
            <div class="alert-type-grid">
              <button (click)="triggerAlert('code_blue')" class="code-btn code-blue">
                Code Blue (Cardiac Arrest)
              </button>
              <button (click)="triggerAlert('trauma_alert')" class="code-btn trauma">
                Trauma Alert (Level 1)
              </button>
              <button (click)="triggerAlert('stroke_alert')" class="code-btn stroke">
                Stroke Alert
              </button>
              <button (click)="triggerAlert('sepsis_alert')" class="code-btn sepsis">
                Severe Sepsis Alert
              </button>
            </div>
            <div class="form-group" style="margin-top: 16px;">
              <label>Room or Bed Number (Optional)</label>
              <input type="text" [(ngModel)]="alertLocation" placeholder="e.g. Bed 01 or Room A">
            </div>
          </div>
          <div class="er-modal-footer">
            <button (click)="showQuickAlert = false" class="er-btn er-btn-secondary">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <ng-template #unauthLayout>
      <router-outlet></router-outlet>
    </ng-template>
  `,
  styles: [`
    .er-layout {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background-color: var(--bg-main);
    }
    .er-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 64px;
      padding: 0 24px;
      background-color: var(--bg-card);
      border-bottom: 1px solid var(--border-color);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 16px;
      .brand-title h1 { font-size: 1.1rem; font-weight: 800; letter-spacing: 0.5px; color: #111827; }
      .brand-sub { font-size: 0.72rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    }
    .ws-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.5px;
      border: 1px solid var(--border-color);
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      &.connected {
        background-color: #ecfdf5;
        color: #059669;
        border-color: #a7f3d0;
        .status-dot { background-color: #10b981; }
      }
      &.reconnecting {
        background-color: #fffbeb;
        color: #d97706;
        border-color: #fde68a;
        .status-dot { background-color: #f59e0b; animation: pulse-dot 1s infinite; }
      }
      &.disconnected {
        background-color: #f3f4f6;
        color: #6b7280;
        border-color: #e5e7eb;
        .status-dot { background-color: #9ca3af; }
      }
    }
    @keyframes pulse-dot {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.3); }
      100% { opacity: 1; transform: scale(1); }
    }
    .er-nav {
      display: flex;
      align-items: center;
      gap: 6px;
      .nav-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        color: var(--text-muted);
        text-decoration: none;
        font-weight: 600;
        font-size: 0.88rem;
        border-radius: var(--radius-sm);
        transition: all 0.15s ease;
        &:hover { color: var(--text-main); background-color: var(--bg-card-hover); }
        &.active { color: #ffffff; background-color: var(--pq-brand-primary); }
      }
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .user-badge {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 4px 12px;
      background-color: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      .user-info { display: flex; flex-direction: column; text-align: right; }
      .user-name { font-size: 0.85rem; font-weight: 700; }
      .user-role { font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; }
      .logout-btn { background: none; border: none; cursor: pointer; font-size: 0.8rem; font-weight: 700; color: #ef4444; }
    }
    .er-main-content {
      flex: 1;
      padding: 24px;
    }
    .er-toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      z-index: 9999;
      max-width: 400px;
    }
    .er-toast {
      padding: 14px 18px;
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
      &.code_blue, &.alert { border-color: #ef4444; background-color: #fef2f2; }
      &.success { border-color: #10b981; }
      .toast-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
      .toast-close { background: none; border: none; color: #111827; font-size: 1.2rem; cursor: pointer; }
      .toast-msg { font-size: 0.85rem; color: var(--text-muted); }
    }
    .alert-type-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      .code-btn {
        min-height: 50px;
        font-weight: 700;
        font-size: 0.88rem;
        border-radius: var(--radius-md);
        border: none;
        color: #fff;
        cursor: pointer;
        &.code-blue { background-color: var(--pq-brand-primary); }
        &.trauma { background-color: #dc2626; }
        &.stroke { background-color: #d97706; }
        &.sepsis { background-color: #7c3aed; }
      }
    }
  `]
})
export class AppComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);
  readonly toastService = inject(ToastService);
  readonly realtime = inject(EmergencyRealtimeService);
  private readonly api = inject(ApiService);

  showQuickAlert = false;
  alertLocation = '';
  private realtimeSub?: Subscription;

  ngOnInit(): void {
    if (this.auth.isLoggedIn()) {
      this.subscribeRealtimeEvents();
    }
  }

  ngOnDestroy(): void {
    this.realtimeSub?.unsubscribe();
  }

  private subscribeRealtimeEvents(): void {
    const room = `hospital_${this.auth.getHospitalId()}`;
    this.realtimeSub = this.realtime.connect(room).subscribe((rawMsg) => {
      const event = unwrapErRealtimeEvent(rawMsg);
      if (!event) return;

      if (event.eventType === 'er_alert_triggered') {
        const alertType = event.data.alert_type?.replace('_', ' ').toUpperCase() || 'ALERT';
        const location = event.data.location_bed_code ? ` at ${event.data.location_bed_code}` : '';
        this.toastService.show(
          `EMERGENCY ALERT: ${alertType}`,
          `Sent by ${event.data.triggered_by_name || 'Nurse'}${location}`,
          'alert',
          8000
        );
      } else if (event.eventType === 'er_patient_created') {
        this.toastService.show('NEW PATIENT INTAKE', `${event.data.name} registered`, 'info', 4000);
      }
    });
  }

  formatRole(role: string): string {
    return 'NURSE';
  }

  openQuickAlertModal(): void {
    this.showQuickAlert = true;
  }

  triggerAlert(alertType: string): void {
    this.api.triggerCriticalAlert({
      alert_type: alertType,
      severity: 'critical',
      notes: this.alertLocation ? `Location: ${this.alertLocation}` : undefined
    }).subscribe(() => {
      this.showQuickAlert = false;
      this.alertLocation = '';
    });
  }
}
