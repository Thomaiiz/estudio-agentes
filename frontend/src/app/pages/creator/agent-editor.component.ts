import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, OnDestroy, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AgentStore } from '../../core/agent-store.service';
import { ApiService } from '../../core/api.service';
import { Agent, Body, EFFORTS, Eyes, PROVIDER_LABEL, Provider, TOOLS } from '../../core/models';
import { CharacterPreview } from '../../three/character-preview';

const SPEC_TEMPLATE = `Você é o NOME, responsável por ... em um time de agentes.

## Função
- O que este agente faz (uma linha por responsabilidade).

## Entregas
- O que ele devolve no fim e em que formato (arquivos, tabela, roteiro...).

## Como trabalha com o time
- Com quem fala, quando pede revisão, o que nunca faz sem aprovação.
`;

type Draft = Omit<Agent, 'id' | 'deskIndex' | 'status' | 'completedTasks' | 'lastDurationMs'>;

@Component({
  selector: 'app-agent-editor',
  imports: [FormsModule, RouterLink],
  templateUrl: './agent-editor.component.html',
  styleUrl: './agent-editor.component.css',
})
export class AgentEditorComponent implements AfterViewInit, OnDestroy {
  /** Parâmetro de rota :id (ausente em /agentes/novo). */
  id = input<string>();

  private api = inject(ApiService);
  private cdr = inject(ChangeDetectorRef);
  store = inject(AgentStore);
  private router = inject(Router);
  private host = viewChild.required<ElementRef<HTMLDivElement>>('preview');
  private preview?: CharacterPreview;

  readonly COLORS = ['#E07A5F', '#F2CC8F', '#E56B9F', '#B48EF0', '#7B8CDE', '#3D7DD8', '#4FB0A5', '#6DBE6A', '#C49A6C', '#9AA0A6'];
  readonly BODIES: { id: Body; label: string }[] = [{ id: 'BLOCOS', label: 'Blocos' }, { id: 'NUVEM', label: 'Nuvem' }, { id: 'ESTRELA', label: 'Estrela' }];
  readonly EYES: { id: Eyes; label: string }[] = [{ id: 'PONTOS', label: 'Pontos' }, { id: 'CHEVRON', label: 'Chevron' }, { id: 'PROMPT', label: 'Prompt' }];
  readonly PROVIDERS = Object.entries(PROVIDER_LABEL) as [Provider, string][];
  readonly EFFORTS = EFFORTS;
  readonly TOOLS = TOOLS;

  draft: Draft = {
    name: '', role: '', provider: 'CLAUDE', model: 'claude-sonnet-5-5', effort: 'MEDIO',
    color: '#B48EF0', body: 'BLOCOS', eyes: 'PONTOS', antennas: false, orchestrator: false,
    tools: ['LER_ARQUIVOS', 'BUSCAR_CODIGO'], spec: SPEC_TEMPLATE, teamIds: [],
  };
  editing = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);

  ngAfterViewInit() {
    this.preview = new CharacterPreview(this.host().nativeElement);
    this.refresh();
    const id = Number(this.id());
    if (id) {
      this.editing.set(true);
      this.api.agent(id).subscribe({
        next: a => {
          const { id: _i, deskIndex: _d, status: _s, completedTasks: _c, lastDurationMs: _l, ...rest } = a;
          this.draft = { ...rest, tools: [...a.tools], teamIds: [...(a.teamIds ?? [])] };
          this.refresh();
          this.cdr.markForCheck(); // app é zoneless: avisa o Angular que o formulário mudou
        },
        error: () => this.error.set('Agente não encontrado'),
      });
    }
  }

  ngOnDestroy() {
    this.preview?.dispose();
  }

  refresh() {
    this.preview?.setLook(this.draft);
  }

  set<K extends keyof Draft>(key: K, value: Draft[K]) {
    this.draft = { ...this.draft, [key]: value };
    this.refresh();
  }

  toggleTool(tool: string) {
    const has = this.draft.tools.includes(tool);
    this.draft = { ...this.draft, tools: has ? this.draft.tools.filter(t => t !== tool) : [...this.draft.tools, tool] };
  }

  toggleMate(id: number) {
    const has = this.draft.teamIds.includes(id);
    if (!has && this.draft.teamIds.length >= 3) { this.error.set('A equipe fixa tem no máximo 3 agentes'); return; }
    this.error.set(null);
    this.draft = { ...this.draft, teamIds: has ? this.draft.teamIds.filter(t => t !== id) : [...this.draft.teamIds, id] };
  }

  save() {
    if (!this.draft.name.trim()) { this.error.set('Dê um nome ao agente'); return; }
    this.saving.set(true);
    this.error.set(null);
    const id = Number(this.id());
    const req = this.editing() ? this.api.updateAgent(id, this.draft) : this.api.createAgent(this.draft);
    req.subscribe({
      next: a => this.router.navigate(['/escritorio'], { queryParams: { agente: a.id } }),
      error: err => { this.saving.set(false); this.error.set(err?.error?.erro ?? 'Não foi possível salvar'); },
    });
  }

  remove() {
    const id = Number(this.id());
    if (!id) return;
    this.api.deleteAgent(id).subscribe(() => this.router.navigate(['/equipe']));
  }
}
