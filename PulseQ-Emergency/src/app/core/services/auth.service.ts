import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User } from '../models/emergency.models';

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  readonly currentUser = signal<User | null>(null);
  readonly token = signal<string | null>(null);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const storedToken = localStorage.getItem('pulseq_er_token');
      const storedUser = localStorage.getItem('pulseq_er_user');
      if (storedToken && storedUser) {
        this.token.set(storedToken);
        try {
          this.currentUser.set(JSON.parse(storedUser));
        } catch {
          this.clearSession();
        }
      }
    }
  }

  login(credentials: { email: string; password: string }): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${environment.apiBaseUrl}/auth/login`, credentials).pipe(
      tap(res => {
        this.token.set(res.access_token);
        this.currentUser.set(res.user);
        if (isPlatformBrowser(this.platformId)) {
          localStorage.setItem('pulseq_er_token', res.access_token);
          localStorage.setItem('pulseq_er_user', JSON.stringify(res.user));
        }
      })
    );
  }

  logout(): void {
    this.clearSession();
    this.router.navigate(['/auth/login']);
  }

  private clearSession(): void {
    this.token.set(null);
    this.currentUser.set(null);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('pulseq_er_token');
      localStorage.removeItem('pulseq_er_user');
    }
  }

  isLoggedIn(): boolean {
    return !!this.token();
  }

  getHospitalId(): string {
    return this.currentUser()?.hospital_id || 'HOSP-01';
  }
}
