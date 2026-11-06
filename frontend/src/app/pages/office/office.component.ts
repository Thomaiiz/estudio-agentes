import { DatePipe } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AgentStore } from '../../core/agent-store.service';
import { ApiService } from '../../core/api.service';
import { Agent, PROVIDER_LABEL, STATUS_LABEL } from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';
import { OfficeScene } from '../../three/office-scene';

@Component({
  selector: 'app-office',
  imports: [FormsModule, DatePipe, RouterLink],
  templateUrl: './office.component.html',
  styleUrl: './office.component.css',
})
export class OfficeComponent implements AfterViewInit, OnDestroy {
  store = inject(AgentStore);
  private api = inject(ApiService);
  private realtime = inject(RealtimeService);

  readonly STATUS_LABEL = STATUS_LABEL;
  readonly PROVIDER_LABEL = PROVIDER_LABEL;
  readonly suggestions = [
    'Criar a tela de login', 'Revisar o último PR', 'Pesquisar bibliotecas de gráficos',
    'Escrever testes do serviço de tarefas', 'Desenhar o ícone do app',
  ];

  /** ?agente=ID abre o painel desse agente (vindo da tela Equipe). */
  agente = input<string>();

  private host = viewChild.required<ElementRef<HTMLDivElement>>('stage');
  private scene?: OfficeScene;

  selectedId = signal<number | null>(null);
  selected = computed(() => this.store.agents().find(a => a.id === this.selectedId()));
  selectedTask = computed(() => {
    const id = this.selectedId();
    return id != null ? this.store.activeTask()[id] : undefined;
  });

  title = '';
  description = '';
  viaWebSocket = true;
  sending = signal(false);
  stopping = signal(false);
  toast = signal<string | null>(null);

  constructor() {
    // mantém a cena 3D sincronizada com o estado (sinais)
    effect(() => {
      const agents = this.store.agents();
      this.scene?.setAgents(agents);
    });
    effect(() => {
      const tasks = this.store.activeTask();
      for (const a of this.store.agents()) this.scene?.setTask(a.id, tasks[a.id]);
    });
    // ao abrir um agente, busca a última entrega dele (para o botão "Ver o que ele fez" após recarregar a página)
    effect(() => {
      const id = this.selectedId();
      if (id == null || this.store.lastDone()[id]) return;
      this.api.agentTasks(id, 10).subscribe(list => {
        const last = list.find(t => t.status === 'CONCLUIDA' || t.status === 'FALHOU');
        if (last && !this.store.lastDone()[id]) this.store.lastDone.update(m => ({ ...m, [id]: last }));
      });
    });
    // a última mensagem de progresso aparece na tela do monitor
    this.realtime.events$.pipe(takeUntilDestroyed()).subscribe(e => {
      if (e.message) this.scene?.setTask(e.agentId, e.task ?? undefined, e.message);
    });
  }

  ngAfterViewInit() {
    this.scene = new OfficeScene(this.host().nativeElement);
    this.scene.onSelect = id => this.selectedId.set(id);
    this.scene.setAgents(this.store.agents());
    const fromQuery = Number(this.agente());
    if (fromQuery) {
      this.selectedId.set(fromQuery);
      this.scene.select(fromQuery);
    }
  }

  ngOnDestroy() {
    this.scene?.dispose();
  }

  teamNames(a: Agent) {
    const names = a.teamIds.map(id => this.store.byId(id)?.name).filter(Boolean) as string[];
    return names.length > 1 ? names.slice(0, -1).join(', ') + ' e ' + names.at(-1) : names[0] ?? '';
  }

  lastDone = computed(() => {
    const id = this.selectedId();
    return id != null ? this.store.lastDone()[id] : undefined;
  });

  copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => this.flash('Caminho copiado'));
  }

  pick(id: number) {
    const next = this.selectedId() === id ? null : id;
    this.selectedId.set(next);
    this.scene?.select(next);
  }

  close() {
    this.selectedId.set(null);
    this.scene?.select(null);
  }

  send() {
    const agent = this.selected();
    const title = this.title.trim();
    if (!agent || !title) return;
    const description = this.description.trim() || undefined;
    if (this.viaWebSocket && this.realtime.assignTask(agent.id, title, description)) {
      this.done(`Tarefa enviada para ${agent.name} pelo WebSocket`);
      return;
    }
    this.sending.set(true);
    this.api.assignTask(agent.id, title, description).subscribe({
      next: () => this.done(`Tarefa enviada para ${agent.name}`),
      error: err => { this.sending.set(false); this.flash(err?.error?.erro ?? 'Falha ao enviar a tarefa'); },
    });
  }

  /** Para a tarefa atual do agente e esvazia a fila dele (no Chefe Atlas, o time todo para junto). */
  stop() {
    const agent = this.selected();
    if (!agent) return;
    this.stopping.set(true);
    this.api.stopAgent(agent.id).subscribe({
      next: r => { this.stopping.set(false); this.flash(r.paradas ? `${agent.name} parou` : `${agent.name} não estava trabalhando`); },
      error: () => { this.stopping.set(false); this.flash('Não consegui parar o agente'); },
    });
  }

  private done(msg: string) {
    this.sending.set(false);
    this.title = '';
    this.description = '';
    this.flash(msg);
  }

  private flash(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(null), 2600);
  }
}
