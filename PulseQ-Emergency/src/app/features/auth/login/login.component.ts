import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-container">
      <div class="login-card er-card">
        <div class="brand-header">
          <h2>PULSEQ EMERGENCY</h2>
          <p>Hospital Emergency Department Command Center</p>
        </div>

        <form (ngSubmit)="onLogin()" class="login-form">
          <div class="form-group">
            <label>Email Address</label>
            <input type="email" [(ngModel)]="email" name="email" required placeholder="staff@hospital.com">
          </div>

          <div class="form-group">
            <label>Password</label>
            <input type="password" [(ngModel)]="password" name="password" required placeholder="••••••••">
          </div>

          <div *ngIf="errorMessage" class="error-banner">
            {{ errorMessage }}
          </div>

          <button type="submit" [disabled]="loading" class="er-btn er-btn-primary" style="width: 100%; margin-top: 12px;">
            {{ loading ? 'Authenticating...' : 'Sign In to Emergency Portal' }}
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .login-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: var(--bg-main);
    }
    .login-card {
      width: 100%;
      max-width: 420px;
      padding: 36px 32px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    }
    .brand-header {
      text-align: center;
      margin-bottom: 28px;
      h2 { font-weight: 900; font-size: 1.4rem; letter-spacing: 0.5px; color: var(--text-main); }
      p { color: var(--text-muted); font-size: 0.85rem; margin-top: 4px; }
    }
    .error-banner {
      padding: 10px 14px;
      background-color: #fef2f2;
      border: 1px solid #fca5a5;
      color: #dc2626;
      border-radius: var(--radius-md);
      font-size: 0.85rem;
      margin-bottom: 12px;
    }
  `]
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  loading = false;
  errorMessage = '';

  onLogin(): void {
    if (!this.email || !this.password) return;
    this.loading = true;
    this.errorMessage = '';

    this.auth.login({ email: this.email, password: this.password }).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate(['/emergency/dashboard']);
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err?.error?.detail || 'Invalid credentials. Please verify your email and password.';
      }
    });
  }
}
