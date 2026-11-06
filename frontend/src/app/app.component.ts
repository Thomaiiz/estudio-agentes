import { Component, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AgentStore } from './core/agent-store.service';
import { RealtimeService } from './core/realtime.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="rail">
      <div class="brand" title="Estúdio de Agentes">
        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
          <rect x="4" y="9" width="24" height="17" rx="5" fill="#f08a5d"/>
          <rect x="8" y="4" width="5" height="6" rx="1.5" fill="#f08a5d"/>
          <rect x="19" y="4" width="5" height="6" rx="1.5" fill="#f08a5d"/>
          <rect x="11" y="14" width="3" height="6" rx="1" fill="#1a120d"/>
          <rect x="18" y="14" width="3" height="6" rx="1" fill="#1a120d"/>
        </svg>
      </div>
      @for (item of nav; track item.path) {
        <a [routerLink]="item.path" routerLinkActive="on" [title]="item.label">
          <span class="ico" [innerHTML]="item.icon"></span>
          <span class="txt">{{ item.label }}</span>
        </a>
      }
      <div class="spacer"></div>
      <div class="conn" [class]="realtime.state()" [title]="'WebSocket: ' + realtime.state()">
        <span class="dot"></span><span class="txt">{{ realtime.state() }}</span>
      </div>
    </nav>
    <main><router-outlet /></main>
  `,
  styles: [`
    :host { display: flex; height: 100vh; }
    .rail { width: 88px; flex: none; background: #100e0c; border-right: 1px solid var(--line);
      display: flex; flex-direction: column; align-items: center; padding: 14px 0; gap: 4px; }
    .brand { padding: 6px 0 14px; }
    a { width: 72px; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 9px 0;
      border-radius: 12px; color: var(--muted); text-decoration: none; font-size: 11px; }
    a:hover { color: var(--text); background: var(--panel); }
    a.on { color: var(--text); background: var(--panel-2); }
    .ico { display: grid; place-items: center; width: 22px; height: 22px; }
    .spacer { flex: 1; }
    .conn { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 10.5px; color: var(--muted); }
    .conn .dot { background: var(--warn); }
    .conn.online .dot { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
    .conn.offline .dot { background: var(--err); }
    main { flex: 1; min-width: 0; overflow: auto; }
    @media (max-width: 720px) {
      :host { flex-direction: column-reverse; }
      .rail { width: 100%; flex-direction: row; justify-content: space-around; padding: 6px; border-right: 0; border-top: 1px solid var(--line); }
      .brand, .spacer, .conn .txt { display: none; }
      a { width: auto; flex: 1; }
    }
  `],
})
export class AppComponent {
  realtime = inject(RealtimeService);
  // instancia o store cedo para já ouvir os eventos
  private store = inject(AgentStore);

  private sanitizer = inject(DomSanitizer);
  private icon = (paths: string): SafeHtml => this.sanitizer.bypassSecurityTrustHtml(svg(paths));

  nav = [
    { path: '/escritorio', label: 'Escritório', icon: this.icon('<path d="M3 21V9l9-6 9 6v12"/><path d="M9 21v-6h6v6"/>') },
    { path: '/equipe', label: 'Equipe', icon: this.icon('<circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M15 15c3 0 6 1.8 6 5"/>') },
    { path: '/agentes/novo', label: 'Novo', icon: this.icon('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>') },
    { path: '/dados', label: 'Dados', icon: this.icon('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>') },
    { path: '/ajustes', label: 'Ajustes', icon: this.icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>') },
  ];
}

function svg(paths: string) {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}
