import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DashboardState } from '../../core/dashboard-state';

@Component({
  selector: 'app-workflow',
  imports: [FormsModule],
  templateUrl: './workflow.html',
})
export class WorkflowPage {
  readonly state = inject(DashboardState);
}
