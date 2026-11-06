import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'escritorio' },
  { path: 'escritorio', loadComponent: () => import('./pages/office/office.component').then(m => m.OfficeComponent) },
  { path: 'equipe', loadComponent: () => import('./pages/team/team.component').then(m => m.TeamComponent) },
  { path: 'agentes/novo', loadComponent: () => import('./pages/creator/agent-editor.component').then(m => m.AgentEditorComponent) },
  { path: 'agentes/:id', loadComponent: () => import('./pages/creator/agent-editor.component').then(m => m.AgentEditorComponent) },
  { path: 'entregas/:id', loadComponent: () => import('./pages/delivery/delivery.component').then(m => m.DeliveryComponent) },
  { path: 'dados', loadComponent: () => import('./pages/data/data.component').then(m => m.DataComponent) },
  { path: 'ajustes', loadComponent: () => import('./pages/settings/settings.component').then(m => m.SettingsComponent) },
  { path: '**', redirectTo: 'escritorio' },
];
