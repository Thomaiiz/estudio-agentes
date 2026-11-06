import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { AgentStore } from '../../core/agent-store.service';
import { ApiService } from '../../core/api.service';
import { ProjectFile, ProjectFiles } from '../../core/models';

type Kind = 'site' | 'imagem' | 'texto' | 'binario';
const TEXT_EXT = /\.(md|txt|css|scss|js|mjs|ts|tsx|jsx|json|java|py|xml|yml|yaml|sql|sh|env|gitignore|properties|toml|csv|svg)$/i;

/** "Ver o que ele fez": arquivos da entrega, com prévia do site e do código. */
@Component({
  selector: 'app-delivery',
  imports: [DatePipe, RouterLink],
  templateUrl: './delivery.component.html',
  styleUrl: './delivery.component.css',
})
export class DeliveryComponent {
  id = input.required<string>();

  private api = inject(ApiService);
  private sanitizer = inject(DomSanitizer);
  store = inject(AgentStore);

  data = signal<ProjectFiles | null>(null);
  error = signal<string | null>(null);
  onlyChanged = signal(true);
  selected = signal<ProjectFile | null>(null);
  text = signal<string | null>(null);
  frameUrl = signal<SafeResourceUrl | null>(null);
  copied = signal(false);

  agent = computed(() => {
    const d = this.data();
    return d ? this.store.byId(d.agentId) : undefined;
  });
  changedCount = computed(() => this.data()?.files.filter(f => f.changed).length ?? 0);
  visible = computed(() => {
    const files = this.data()?.files ?? [];
    return this.onlyChanged() && this.changedCount() ? files.filter(f => f.changed) : files;
  });
  /** Página principal do projeto, se houver (index.html na raiz ou em frontend/). */
  site = computed(() => {
    const files = this.data()?.files ?? [];
    return ['index.html', 'frontend/index.html', 'public/index.html', 'src/index.html']
      .map(p => files.find(f => f.path === p)).find(Boolean)
      ?? files.find(f => f.path.endsWith('.html'));
  });
  kind = computed<Kind>(() => kindOf(this.selected()?.path ?? ''));

  constructor() {
    effect(() => this.load(Number(this.id())));
  }

  load(taskId: number) {
    this.error.set(null);
    this.api.files(taskId).subscribe({
      next: d => {
        this.data.set(d);
        if (!this.selected()) {
          const first = this.site() ?? d.files.find(f => f.changed) ?? d.files[0];
          if (first) this.open(first);
        }
      },
      error: err => this.error.set(err?.error?.erro ?? 'Não foi possível carregar a entrega'),
    });
  }

  open(file: ProjectFile) {
    const taskId = Number(this.id());
    this.selected.set(file);
    this.text.set(null);
    this.frameUrl.set(null);
    const k = kindOf(file.path);
    if (k === 'site' || k === 'imagem') {
      this.frameUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.api.rawUrl(taskId, file.path)));
    } else if (k === 'texto') {
      this.api.rawText(taskId, file.path).subscribe({
        next: t => this.text.set(t.length > 200_000 ? t.slice(0, 200_000) + '\n…(cortado)' : t),
        error: () => this.text.set('Não foi possível ler o arquivo.'),
      });
    }
  }

  rawUrl(path: string) {
    return this.api.rawUrl(Number(this.id()), path);
  }

  copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    });
  }

  size(n: number) {
    return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
  }
}

function kindOf(path: string): Kind {
  if (/\.html?$/i.test(path)) return 'site';
  if (/\.(png|jpe?g|gif|webp|ico|bmp)$/i.test(path)) return 'imagem';
  if (TEXT_EXT.test(path) || !/\.[a-z0-9]+$/i.test(path.split('/').pop() ?? '')) return 'texto';
  return 'binario';
}
