import { Injectable, NgZone, OnDestroy, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { AgentEvent } from './models';

export type ConnectionState = 'conectando' | 'online' | 'offline';

/**
 * Conexão WebSocket com o backend (/ws/agents), com reconexão automática.
 * Publica cada AgentEvent recebido em `events$`.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
  readonly state = signal<ConnectionState>('conectando');
  readonly events$ = new Subject<AgentEvent>();

  private ws?: WebSocket;
  private retry = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private zone = inject(NgZone);

  constructor() {
    this.connect();
  }

  /** Envia uma tarefa pelo próprio WebSocket (alternativa ao POST REST). */
  assignTask(agentId: number, title: string, description?: string): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ action: 'ASSIGN_TASK', agentId, title, description }));
    return true;
  }

  private connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.state.set('conectando');
    const ws = new WebSocket(`${proto}://${location.host}/ws/agents`);
    this.ws = ws;
    ws.onopen = () => { this.retry = 0; this.state.set('online'); };
    ws.onmessage = msg => {
      try {
        const data = JSON.parse(msg.data);
        if (data?.agentId !== undefined && data?.type) {
          this.zone.run(() => this.events$.next(data as AgentEvent));
        } else if (data?.type === 'ERROR') {
          console.warn('[ws]', data.message);
        }
      } catch { /* mensagem inválida: ignora */ }
    };
    ws.onclose = () => {
      this.state.set('offline');
      if (this.closed) return;
      const delay = Math.min(10_000, 500 * 2 ** this.retry++);
      this.timer = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  ngOnDestroy() {
    this.closed = true;
    clearTimeout(this.timer);
    this.ws?.close();
  }
}
