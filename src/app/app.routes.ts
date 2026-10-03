import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'projects' },
  {
    path: 'projects',
    loadComponent: () => import('./pages/projects/projects').then((m) => m.ProjectsPage),
  },
  {
    path: 'workflow',
    loadComponent: () => import('./pages/workflow/workflow').then((m) => m.WorkflowPage),
  },
  {
    path: 'workload',
    loadComponent: () => import('./pages/workload/workload').then((m) => m.WorkloadPage),
  },
  { path: 'bugs', loadComponent: () => import('./pages/bugs/bugs').then((m) => m.BugsPage) },
  {
    path: 'qa-members',
    loadComponent: () => import('./pages/qa-members/qa-members').then((m) => m.QaMembersPage),
  },
  {
    path: 'documentation',
    loadComponent: () => import('./pages/documentation/documentation').then((m) => m.DocumentationPage),
  },
  {
    path: 'knowledge-rag',
    loadComponent: () => import('./pages/knowledge/knowledge').then((m) => m.KnowledgePage),
  },
  { path: '**', redirectTo: 'projects' },
];
