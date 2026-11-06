import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AgentStore } from '../../core/agent-store.service';
import { ApiService } from '../../core/api.service';
import { Agent, EFFORTS, Effort, PROVIDER_LABEL, STATUS_LABEL, formatDuration } from '../../core/models';
import { CharacterSnapshotService } from '../../three/snapshot.service';

@Component({
  selector: 'app-team',
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="head">
        <div>
          <h1>Equipe</h1>
          <p class="sub">{{ store.agents().length }} agentes · escolha modelo e esforço de cada um.</p>
        </div>
        <a class="btn primary" routerLink="/agentes/novo">+ Novo agente</a>
      </div>

      <div class="grid">
        @for (a of store.agents(); track a.id) {
          <article class="card agent">
            <div class="hero" [style.--c]="a.color">
              <span class="state"><span class="dot" [class]="a.status"></span>{{ STATUS_LABEL[a.status] }}</span>
              <img [src]="snap.image(a)" [alt]="a.name" width="150" height="150">
            </div>
            <div class="body">
              <div class="title"><h2>{{ a.name }}</h2><span class="label">{{ PROVIDER_LABEL[a.provider] }}</span></div>
              <p class="sub">{{ a.role }}</p>
              @if (a.teamIds.length) {
                <span class="team">Equipe com {{ teamNames(a) }}</span>
              }
              <div class="model">{{ a.model }}</div>
              <div class="efforts">
                @for (e of EFFORTS; track e.id) {
                  <button [class.on]="a.effort === e.id" (click)="setEffort(a, e.id)">{{ e.label }}</button>
                }
              </div>
              <div class="stats">
                <div><span class="label">Concluídas</span><strong>{{ a.completedTasks }}</strong></div>
                <div><span class="label">Última</span><strong>{{ fmt(a.lastDurationMs) }}</strong></div>
                <div><span class="label">Ferramentas</span><strong>{{ a.tools.length }}</strong></div>
              </div>
              <div class="actions">
                <a class="btn" [routerLink]="['/escritorio']" [queryParams]="{ agente: a.id }">Mandar tarefa</a>
                <a class="btn ghost" [routerLink]="['/agentes', a.id]">Editar</a>
              </div>
            </div>
          </article>
        }
      </div>
    </div>
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
    .head a { text-decoration: none; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 16px; }
    .agent { overflow: hidden; }
    .hero { position: relative; height: 170px; display: grid; place-items: center;
      background: radial-gradient(circle at 50% 70%, color-mix(in srgb, var(--c) 28%, transparent), transparent 65%), #1a1613; }
    .hero img { width: 150px; height: 150px; }
    .state { position: absolute; top: 10px; left: 10px; display: flex; align-items: center; gap: 6px; font-size: 11.5px;
      color: var(--muted); background: rgba(0,0,0,.35); padding: 4px 8px; border-radius: 999px; }
    .body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 10px; }
    .title { display: flex; justify-content: space-between; align-items: baseline; }
    .title h2 { font-size: 17px; margin: 0; }
    .team { align-self: flex-start; font-size: 11.5px; color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); padding: 3px 8px; border-radius: 999px; }
    .model { background: var(--bg-2); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; font-weight: 600; font-size: 13px; }
    .efforts { display: flex; flex-wrap: wrap; gap: 4px; }
    .efforts button { background: transparent; border: 0; color: var(--muted); font-size: 12px; padding: 4px 8px; border-radius: 999px; }
    .efforts button.on { background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--accent); font-weight: 600; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; border-top: 1px solid var(--line); padding-top: 10px; }
    .stats div { display: flex; flex-direction: column; gap: 2px; }
    .actions { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
    .actions a { text-decoration: none; text-align: center; }
  `],
})
export class TeamComponent {
  store = inject(AgentStore);
  snap = inject(CharacterSnapshotService);
  private api = inject(ApiService);
  readonly STATUS_LABEL = STATUS_LABEL;
  readonly PROVIDER_LABEL = PROVIDER_LABEL;
  readonly EFFORTS = EFFORTS;
  fmt = formatDuration;

  teamNames(a: Agent) {
    const names = a.teamIds.map(id => this.store.byId(id)?.name).filter(Boolean) as string[];
    return names.length > 1 ? names.slice(0, -1).join(', ') + ' e ' + names.at(-1) : names[0] ?? '';
  }

  setEffort(a: Agent, effort: Effort) {
    if (a.effort === effort) return;
    // a atualização volta para todos os painéis pelo evento AGENT_UPDATED do WebSocket
    this.api.updateAgent(a.id, { ...a, effort }).subscribe();
  }
}
