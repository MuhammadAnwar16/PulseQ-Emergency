import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { LoginComponent } from './features/auth/login/login.component';
import { DashboardComponent } from './features/emergency/dashboard/dashboard.component';
import { TriageComponent } from './features/emergency/triage/triage.component';
import { BedBoardComponent } from './features/emergency/bed-board/bed-board.component';
import { CriticalAlertsComponent } from './features/emergency/critical-alerts/critical-alerts.component';
import { PatientsComponent } from './features/emergency/patients/patients.component';

export const routes: Routes = [
  { path: '', redirectTo: 'emergency/dashboard', pathMatch: 'full' },
  { path: 'auth/login', component: LoginComponent },
  { path: 'emergency/dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'emergency/triage', component: TriageComponent, canActivate: [authGuard] },
  { path: 'emergency/bed-board', component: BedBoardComponent, canActivate: [authGuard] },
  { path: 'emergency/critical-alerts', component: CriticalAlertsComponent, canActivate: [authGuard] },
  { path: 'emergency/patients', component: PatientsComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'auth/login' }
];
