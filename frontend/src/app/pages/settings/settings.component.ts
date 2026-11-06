import { Component, signal } from '@angular/core';

type Tab = 'contas' | 'voz' | 'skills';

/** Tela de ajustes: esqueleto para as próximas etapas (fora do escopo do MVP). */
@Component({
  selector: 'app-settings',
  template: `
    <div class="page">
      <div class="head">
        <div>
          <h1>Ajustes</h1>
          <p class="sub">Contas das IAs, voz e skills dos agentes.</p>
        </div>
        <div class="seg">
          <button [class.on]="tab() === 'contas'" (click)="tab.set('contas')">Contas</button>
          <button [class.on]="tab() === 'voz'" (click)="tab.set('voz')">Voz</button>
          <button [class.on]="tab() === 'skills'" (click)="tab.set('skills')">Skills</button>
        </div>
      </div>

      @switch (tab()) {
        @case ('contas') {
          <p class="sub intro">Cada provedor será ligado ao backend por um <code>AgentRunner</code> próprio.
            Hoje o Sócios Acrílicos usa o executor simulado, então nenhuma conta é necessária.</p>
          <div class="card list">
            @for (p of providers; track p.name) {
              <div class="item">
                <div><strong>{{ p.name }}</strong><p class="label">{{ p.desc }}</p></div>
                <span class="chip">Simulado</span>
              </div>
            }
          </div>
        }
        @case ('voz') {
          <div class="card empty">
            <h2>Voz por agente</h2>
            <p class="sub">Em breve: cada agente com uma voz própria lendo os eventos em voz alta.</p>
          </div>
        }
        @case ('skills') {
          <div class="card empty">
            <h2>Skills</h2>
            <p class="sub">Em breve: pacotes de instruções reutilizáveis atribuídos aos agentes.</p>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
    .intro { max-width: 620px; margin-bottom: 16px; }
    code { background: var(--bg-2); padding: 1px 6px; border-radius: 6px; }
    .list .item { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 18px; border-top: 1px solid var(--line); }
    .list .item:first-child { border-top: 0; }
    .item p { margin: 4px 0 0; }
    .empty { padding: 28px; }
  `],
})
export class SettingsComponent {
  tab = signal<Tab>('contas');
  providers = [
    { name: 'Claude', desc: 'Agentes com provider CLAUDE' },
    { name: 'OpenAI', desc: 'Agentes com provider OPENAI' },
    { name: 'Gemini', desc: 'Agentes com provider GEMINI' },
    { name: 'Local', desc: 'Modelos rodando na sua máquina' },
  ];
}
