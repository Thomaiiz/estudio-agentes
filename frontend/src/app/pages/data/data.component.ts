import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, filter } from 'rxjs';
import { AgentStore } from '../../core/agent-store.service';
import { ApiService } from '../../core/api.service';
import { PROVIDER_LABEL, Stats, Task, formatDuration } from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';

@Component({
  selector: 'app-data',
  imports: [DatePipe, RouterLink],
  template: `
    <div class="page">
      <h1>Dados</h1>
      <p class="sub">O que o time fez nesta sessão, por provedor. Atualiza sozinho a cada tarefa concluída.</p>

      @if (stats(); as s) {
        <div class="kpis">
          <div class="card kpi"><span class="label">Tarefas</span><strong>{{ s.totalTasks }}</strong></div>
          <div class="card kpi"><span class="label">Concluídas</span><strong>{{ s.completedTasks }}</strong></div>
          <div class="card kpi"><span class="label">Em andamento</span><strong>{{ s.runningTasks }}</strong></div>
          <div class="card kpi"><span class="label">Tempo de trabalho</span><strong>{{ fmt(s.totalDurationMs) }}</strong></div>
        </div>

        <h2>Uso por provedor</h2>
        <div class="providers">
          @for (p of s.providers; track p.provider) {
            <div class="card prov">
              <div class="prov-head"><strong>{{ PROVIDER_LABEL[p.provider] }}</strong><span class="label">{{ p.agents }} agentes</span></div>
              <div class="bar"><div [style.width.%]="share(p.tasks)"></div></div>
              <div class="nums">
                <div><span class="label">Tarefas</span><b>{{ p.tasks }}</b></div>
                <div><span class="label">Sucesso</span><b>{{ p.tasks ? pct(p.completed, p.tasks) : '—' }}</b></div>
                <div><span class="label">Tempo</span><b>{{ fmt(p.totalDurationMs) }}</b></div>
              </div>
              <p class="label note">Limites da assinatura e tokens: em breve (depende da integração real com cada provedor).</p>
            </div>
          }
        </div>
      }

      <h2>Últimas tarefas</h2>
      <div class="card table">
        @for (t of tasks(); track t.id) {
          <a class="row" [routerLink]="t.workspace ? ['/entregas', t.id] : null" [class.link]="!!t.workspace">
            <span class="dot" [style.background]="store.byId(t.agentId)?.color ?? '#888'"></span>
            <span class="who">{{ store.byId(t.agentId)?.name ?? '#' + t.agentId }}</span>
            <span class="what">{{ t.title }}</span>
            <span class="st" [class]="t.status">{{ statusLabel[t.status] }}</span>
            <time>{{ t.createdAt | date: 'dd/MM HH:mm:ss' }}</time>
          </a>
        } @empty {
          <p class="label pad">Nenhuma tarefa ainda. Mande uma pelo Escritório.</p>
        }
      </div>
    </div>
  `,
  styles: [`
    h2 { margin: 26px 0 10px; }
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 20px; }
    .kpi { padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
    .kpi strong { font-size: 26px; letter-spacing: -0.02em; }
    .providers { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    .prov { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    .prov-head { display: flex; justify-content: space-between; }
    .bar { height: 6px; background: var(--line); border-radius: 6px; overflow: hidden; }
    .bar div { height: 100%; background: var(--accent); transition: width .4s; }
    .nums { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .nums div { display: flex; flex-direction: column; gap: 2px; }
    .note { margin: 0; }
    .table { overflow: hidden; }
    .row { display: grid; grid-template-columns: 10px 90px 1fr auto auto; gap: 12px; align-items: center;
      padding: 10px 14px; border-top: 1px solid var(--line); font-size: 13px; }
    .row:first-child { border-top: 0; }
    a.row { color: inherit; text-decoration: none; }
    a.row.link:hover { background: var(--panel-2); cursor: pointer; }
    .what { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .st { font-size: 12px; color: var(--muted); }
    .st.CONCLUIDA { color: var(--ok); } .st.FALHOU { color: var(--err); } .st.EM_ANDAMENTO { color: var(--accent); }
    time { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
    .pad { padding: 14px; margin: 0; }
    @media (max-width: 640px) { .row { grid-template-columns: 10px 1fr auto; } .who, time { display: none; } }
  `],
})
export class DataComponent {
  store = inject(AgentStore);
  private api = inject(ApiService);
  readonly PROVIDER_LABEL = PROVIDER_LABEL;
  readonly statusLabel: Record<Task['status'], string> = {
    NA_FILA: 'Na fila', EM_ANDAMENTO: 'Em andamento', CONCLUIDA: 'Concluída', FALHOU: 'Falhou',
  };
  fmt = formatDuration;

  stats = signal<Stats | null>(null);
  tasks = signal<Task[]>([]);
  private maxTasks = computed(() => Math.max(1, ...(this.stats()?.providers.map(p => p.tasks) ?? [1])));

  constructor() {
    this.load();
    inject(RealtimeService).events$
      .pipe(filter(e => e.type.startsWith('TASK_') && e.type !== 'TASK_PROGRESS'), debounceTime(400), takeUntilDestroyed())
      .subscribe(() => this.load());
  }

  pct(a: number, b: number) {
    return Math.round((a / b) * 100) + '%';
  }

  share(n: number) {
    return (n / this.maxTasks()) * 100;
  }

  private load() {
    this.api.stats().subscribe(s => this.stats.set(s));
    this.api.recentTasks(25).subscribe(t => this.tasks.set(t));
  }
}
