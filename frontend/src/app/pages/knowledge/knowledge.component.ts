import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AgentStore } from '../../core/agent-store.service';
import { ApiService } from '../../core/api.service';
import { Knowledge, VideoStudy } from '../../core/models';
import { RealtimeService } from '../../core/realtime.service';

type Mode = 'video' | 'texto';

/** O que o time aprendeu: vídeos estudados e anotações. Tudo aqui entra no pedido dos agentes. */
@Component({
  selector: 'app-knowledge',
  imports: [FormsModule, DatePipe, RouterLink],
  template: `
    <div class="page">
      <div class="head">
        <div>
          <h1>Aprender</h1>
          <p class="sub">O que você ensinar aqui vai junto em toda tarefa dos agentes escolhidos.</p>
        </div>
        <div class="seg">
          <button [class.on]="mode() === 'video'" (click)="mode.set('video')">Vídeo do YouTube</button>
          <button [class.on]="mode() === 'texto'" (click)="mode.set('texto')">Colar texto</button>
        </div>
      </div>

      <form class="card form" (ngSubmit)="submit()">
        @if (mode() === 'video') {
          <label class="label" for="url">Link do vídeo</label>
          <input id="url" name="url" [(ngModel)]="url" placeholder="https://www.youtube.com/watch?v=..." autocomplete="off">
          <p class="hint">O app baixa a legenda do vídeo (precisa do <code>yt-dlp</code> instalado) e o agente de pesquisa
            assiste, resume e escreve as lições. Quando ele terminar, o aprendizado aparece na lista abaixo.</p>
        } @else {
          <label class="label" for="t">Título</label>
          <input id="t" name="t" [(ngModel)]="title" placeholder="Ex.: Como fazer ganchos para Reels">
          <label class="label" for="c">Conteúdo</label>
          <textarea id="c" name="c" rows="8" [(ngModel)]="content"
            placeholder="Cole aqui a transcrição de um vídeo, um artigo ou suas próprias regras."></textarea>
        }

        <span class="label">Quem aprende</span>
        <div class="chips">
          <button type="button" class="chip" [class.on]="chosen().size === 0" (click)="all()">Todos</button>
          @for (a of store.agents(); track a.id) {
            <button type="button" class="chip" [class.on]="chosen().has(a.id)" (click)="toggle(a.id)">
              <span class="dot" [style.background]="a.color"></span>{{ a.name }}
            </button>
          }
        </div>

        @if (error()) { <p class="error">{{ error() }}</p> }
        @if (study(); as s) {
          <p class="ok">{{ s.agentName }} está estudando "{{ s.videoTitle }}".
            <a [routerLink]="['/escritorio']" [queryParams]="{ agente: s.agentId }">Ver no escritório</a> ·
            <a [routerLink]="['/entregas', s.taskId]">Ver a transcrição</a></p>
        }
        <div class="actions">
          <button class="btn primary" type="submit" [disabled]="busy() || !canSubmit()">
            {{ busy() ? (mode() === 'video' ? 'Baixando a legenda…' : 'Salvando…') : (mode() === 'video' ? 'Aprender com o vídeo' : 'Ensinar') }}
          </button>
        </div>
      </form>

      <h2 class="list-title">O que o time já sabe <span class="label">{{ items().length }}</span></h2>
      @if (!items().length) {
        <div class="card empty"><p class="sub">Nada ainda. Mande um vídeo ou cole um texto acima.</p></div>
      }
      @for (k of items(); track k.id) {
        <article class="card item">
          <div class="item-head" (click)="toggleOpen(k.id)">
            <div>
              <strong>{{ k.title }}</strong>
              <p class="label">
                {{ k.createdAt | date: 'dd/MM HH:mm' }} · {{ whoLearns(k) }}
                @if (k.source) { · <a [href]="k.source" target="_blank" rel="noopener" (click)="$event.stopPropagation()">fonte</a> }
              </p>
            </div>
            <div class="item-actions">
              <button type="button" class="btn ghost">{{ open().has(k.id) ? 'Fechar' : 'Ler' }}</button>
              <button type="button" class="btn ghost danger" (click)="remove(k, $event)">Esquecer</button>
            </div>
          </div>
          @if (open().has(k.id)) { <pre>{{ k.content }}</pre> }
        </article>
      }
    </div>
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
    .form { padding: 20px; display: flex; flex-direction: column; gap: 8px; margin-bottom: 28px; }
    .form input, .form textarea { width: 100%; }
    .form .label { margin-top: 6px; }
    .hint { color: var(--muted); font-size: 13px; margin: 2px 0 0; max-width: 720px; }
    code { background: var(--bg-2); padding: 1px 6px; border-radius: 6px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { cursor: pointer; }
    .chip .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .actions { display: flex; justify-content: flex-end; margin-top: 8px; }
    .error { color: var(--err); white-space: pre-wrap; margin: 4px 0 0; font-size: 13px; }
    .ok { color: var(--ok); margin: 4px 0 0; font-size: 13px; }
    .ok a { color: inherit; }
    .list-title { font-size: 18px; margin: 0 0 12px; display: flex; gap: 8px; align-items: baseline; }
    .empty { padding: 20px; }
    .item { margin-bottom: 10px; }
    .item-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 18px; cursor: pointer; }
    .item-head p { margin: 4px 0 0; }
    .item-head a { color: var(--accent); }
    .item-actions { display: flex; gap: 6px; flex: none; }
    pre { margin: 0; padding: 4px 18px 18px; white-space: pre-wrap; word-break: break-word; font: 13px/1.55 ui-monospace, monospace; color: var(--text); }
    @media (max-width: 720px) { .item-head { flex-direction: column; align-items: flex-start; } }
  `],
})
export class KnowledgeComponent {
  store = inject(AgentStore);
  private api = inject(ApiService);

  mode = signal<Mode>('video');
  items = signal<Knowledge[]>([]);
  chosen = signal<Set<number>>(new Set());
  open = signal<Set<string>>(new Set());
  busy = signal(false);
  error = signal<string | null>(null);
  study = signal<VideoStudy | null>(null);

  url = '';
  title = '';
  content = '';

  canSubmit = () => this.mode() === 'video' ? !!this.url.trim() : !!this.title.trim() && !!this.content.trim();
  private ids = computed(() => [...this.chosen()]);

  constructor() {
    this.load();
    // quando o agente termina de estudar, o aprendizado novo aparece sozinho
    inject(RealtimeService).events$.pipe(takeUntilDestroyed()).subscribe(e => {
      if (e.type === 'TASK_COMPLETED' || e.type === 'TASK_FAILED') setTimeout(() => this.load(), 500);
    });
  }

  load() {
    this.api.knowledge().subscribe(list => this.items.set(list));
  }

  all() { this.chosen.set(new Set()); }

  toggle(id: number) {
    this.chosen.update(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  toggleOpen(id: string) {
    this.open.update(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  whoLearns(k: Knowledge) {
    if (!k.agentIds.length) return 'todos os agentes';
    return k.agentIds.map(id => this.store.byId(id)?.name ?? `#${id}`).join(', ');
  }

  submit() {
    if (!this.canSubmit() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.study.set(null);
    const fail = (err: any) => { this.busy.set(false); this.error.set(err?.error?.erro ?? 'Não deu certo. O backend está rodando?'); };
    if (this.mode() === 'video') {
      this.api.learnVideo(this.url.trim(), this.ids()).subscribe({
        next: s => { this.busy.set(false); this.study.set(s); this.url = ''; },
        error: fail,
      });
    } else {
      this.api.addKnowledge(this.title.trim(), this.content.trim(), this.ids()).subscribe({
        next: k => { this.busy.set(false); this.title = ''; this.content = ''; this.items.update(l => [k, ...l]); },
        error: fail,
      });
    }
  }

  remove(k: Knowledge, ev: Event) {
    ev.stopPropagation();
    this.api.deleteKnowledge(k.id).subscribe(() => this.items.update(l => l.filter(x => x.id !== k.id)));
  }
}
