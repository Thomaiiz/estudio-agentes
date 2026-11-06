import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Agent, AgentEvent, Task } from './models';
import { RealtimeService } from './realtime.service';

export interface FeedItem {
  id: number;
  at: Date;
  agentId: number;
  agentName: string;
  color: string;
  type: AgentEvent['type'];
  text: string;
}

/** Estado global: lista de agentes, tarefa ativa de cada um e feed de eventos. */
@Injectable({ providedIn: 'root' })
export class AgentStore {
  private api = inject(ApiService);
  private realtime = inject(RealtimeService);

  readonly agents = signal<Agent[]>([]);
  readonly activeTask = signal<Record<number, Task | undefined>>({});
  readonly feed = signal<FeedItem[]>([]);
  /** Última tarefa terminada de cada agente (pasta + resumo do que ele fez). */
  readonly lastDone = signal<Record<number, Task>>({});
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);
  readonly busyCount = computed(() => this.agents().filter(a => a.status !== 'DISPONIVEL').length);

  private feedSeq = 0;

  constructor() {
    this.reload();
    this.realtime.events$.subscribe(e => this.apply(e));
  }

  reload() {
    this.api.agents().subscribe({
      next: list => { this.agents.set(list); this.loaded.set(true); this.error.set(null); },
      error: () => this.error.set('Não foi possível falar com o backend em /api. Ele está rodando na porta 8080?'),
    });
  }

  byId(id: number) {
    return this.agents().find(a => a.id === id);
  }

  private apply(e: AgentEvent) {
    switch (e.type) {
      case 'AGENT_CREATED':
        if (e.agent) this.agents.update(l => [...l.filter(a => a.id !== e.agentId), e.agent!]
          .sort((a, b) => a.deskIndex - b.deskIndex));
        break;
      case 'AGENT_DELETED':
        this.agents.update(l => l.filter(a => a.id !== e.agentId));
        break;
      case 'AGENT_UPDATED':
        if (e.agent) this.agents.update(l => l.map(a => a.id === e.agentId ? e.agent! : a));
        break;
      default:
        this.agents.update(l => l.map(a => {
          if (a.id !== e.agentId) return a;
          const next = { ...a, status: e.agentStatus };
          if (e.type === 'TASK_COMPLETED') next.completedTasks = a.completedTasks + 1;
          return next;
        }));
        if (e.task) {
          const done = e.type === 'TASK_COMPLETED' || e.type === 'TASK_FAILED';
          if (done) this.lastDone.update(m => ({ ...m, [e.agentId]: e.task! }));
          this.activeTask.update(m => ({ ...m, [e.agentId]: e.task! }));
          if (done) setTimeout(() => this.activeTask.update(m => {
            const copy = { ...m };
            if (copy[e.agentId]?.id === e.task!.id) delete copy[e.agentId];
            return copy;
          }), 3000);
        }
    }
    this.pushFeed(e);
  }

  private pushFeed(e: AgentEvent) {
    if (e.type === 'TASK_PROGRESS' || e.type === 'AGENT_UPDATED') return; // ruído demais
    const agent = this.byId(e.agentId) ?? e.agent ?? undefined;
    const name = agent?.name ?? `#${e.agentId}`;
    const title = e.task?.title ? `“${e.task.title}”` : '';
    const text: Record<string, string> = {
      AGENT_CREATED: `${name} entrou no time`,
      AGENT_DELETED: `${name} saiu do time`,
      TASK_RECEIVED: `${name} recebeu ${title}`,
      TASK_STARTED: `${name} começou ${title}`,
      TASK_COMPLETED: `${name} concluiu ${title}`,
      TASK_FAILED: `${name} falhou em ${title}`,
    };
    const item: FeedItem = {
      id: ++this.feedSeq, at: new Date(e.timestamp), agentId: e.agentId, agentName: name,
      color: agent?.color ?? '#888', type: e.type, text: text[e.type] ?? e.type,
    };
    this.feed.update(f => [item, ...f].slice(0, 40));
  }
}
