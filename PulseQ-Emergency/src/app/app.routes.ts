import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { LoginComponent } from './features/auth/login/login.component';
import { DashboardComponent } from './features/emergency/dashboard/dashboard.component';
import { TriageComponent } from './features/emergency/triage/triage.component';
import { BedBoardComponent } from './features/emergency/bed-board/bed-board.component';
import { CriticalAlertsComponent } from './features/emergency/critical-alerts/critical-alerts.component';
import { PatientsComponent } from './features/emergency/patients/patients.component';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'auth/login', component: LoginComponent },
  { path: 'login', redirectTo: 'dashboard', pathMatch: 'full' },
  
  // Bare root paths
  { path: 'dashboard', component: DashboardComponent },
  { path: 'triage', component: TriageComponent },
  { path: 'beds', component: BedBoardComponent },
  { path: 'bed-board', component: BedBoardComponent },
  { path: 'critical-alerts', component: CriticalAlertsComponent },
  { path: 'patients', component: PatientsComponent },
  
  // Prefixed /emergency/ paths
  { path: 'emergency', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'emergency/dashboard', component: DashboardComponent },
  { path: 'emergency/triage', component: TriageComponent },
  { path: 'emergency/beds', component: BedBoardComponent },
  { path: 'emergency/bed-board', component: BedBoardComponent },
  { path: 'emergency/critical-alerts', component: CriticalAlertsComponent },
  { path: 'emergency/patients', component: PatientsComponent },
  
  { path: '**', redirectTo: 'dashboard' }
];
