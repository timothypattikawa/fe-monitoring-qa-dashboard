import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DashboardState } from './core/dashboard-state';
import { DashboardDialogsComponent } from './shared/dashboard-dialogs/dashboard-dialogs';
import { LiveDashboardComponent } from './shared/live-dashboard/live-dashboard';
import { LiveDashboardStore } from './core/live-dashboard.store';

@Component({
  selector: 'app-root',
  imports: [DatePipe, FormsModule, RouterLink, RouterOutlet, DashboardDialogsComponent, LiveDashboardComponent],
  templateUrl: './app.html',
})
export class App {
  readonly state = inject(DashboardState);
  readonly live = inject(LiveDashboardStore);
  readonly page = this.state.page;
  private readonly router = inject(Router);

  constructor() {
    this.live.connect();
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed()).subscribe(event => {
      const route = event.urlAfterRedirects.split('/')[1];
      const page = this.state.nav.find(item => item.toLowerCase() === route);
      if (page) this.page.set(page);
    });
  }

  navigate(page: string) {
    this.page.set(page);
    void this.router.navigate([page.toLowerCase()]);
  }

  openProjectForm() {
    this.live.projectFormOpen.set(true);
  }
}
