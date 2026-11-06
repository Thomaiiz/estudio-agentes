import * as THREE from 'three';
import { AgentStatus, STATUS_LABEL } from '../core/models';

export function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, ctx, texture };
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const STATUS_COLOR: Record<AgentStatus, string> = {
  DISPONIVEL: '#57c78a', RECEBENDO: '#f2c14e', PENSANDO: '#f2c14e',
  TRABALHANDO: '#f08a5d', CONCLUIDO: '#57c78a', ERRO: '#e25b5b',
};

/** Etiqueta do agente: "● Nome" + estado. */
export function drawLabel(ctx: CanvasRenderingContext2D, name: string, status: AgentStatus, selected: boolean) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  roundRect(ctx, 4, 4, w - 8, h - 8, 22);
  ctx.fillStyle = selected ? 'rgba(240,138,93,0.95)' : 'rgba(20,18,16,0.86)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = STATUS_COLOR[status];
  ctx.beginPath();
  ctx.arc(34, 38, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = selected ? '#1a120d' : '#f1ebe4';
  ctx.font = '600 30px Inter, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 54, 39, w - 70);
  ctx.font = '500 20px Inter, sans-serif';
  ctx.fillStyle = selected ? 'rgba(26,18,13,0.75)' : '#9b9086';
  ctx.fillText(STATUS_LABEL[status], 54, 72, w - 70);
}

export type BubbleKind = 'alerta' | 'pensando' | 'progresso' | 'ok' | 'erro';

/** Balão acima da cabeça: "!", "...", anel de progresso, ✓ ou ✕. */
export function drawBubble(ctx: CanvasRenderingContext2D, kind: BubbleKind, color: string, progress = 0, tick = 0) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2 - 8, r = 52;
  // balão
  ctx.fillStyle = '#fbf7f2';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.moveTo(cx - 14, cy + r - 6);
  ctx.lineTo(cx, cy + r + 18);
  ctx.lineTo(cx + 14, cy + r - 6);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  switch (kind) {
    case 'alerta':
      ctx.fillStyle = '#f08a5d';
      ctx.font = '800 72px Inter, sans-serif';
      ctx.fillText('!', cx, cy + 4);
      break;
    case 'pensando':
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i <= tick % 3 ? color : '#d8d0c8';
        ctx.beginPath();
        ctx.arc(cx - 24 + i * 24, cy, 9, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'progresso':
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#e9e1d8';
      ctx.beginPath(); ctx.arc(cx, cy, 36, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, 36, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * progress) / 100);
      ctx.stroke();
      ctx.fillStyle = '#2a241f';
      ctx.font = '700 24px Inter, sans-serif';
      ctx.fillText(`${progress}%`, cx, cy + 1);
      break;
    case 'ok':
      ctx.strokeStyle = '#2fa865';
      ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(cx - 24, cy + 2); ctx.lineTo(cx - 6, cy + 20); ctx.lineTo(cx + 26, cy - 18); ctx.stroke();
      break;
    case 'erro':
      ctx.strokeStyle = '#e25b5b';
      ctx.lineWidth = 12; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx - 20, cy - 20); ctx.lineTo(cx + 20, cy + 20);
      ctx.moveTo(cx + 20, cy - 20); ctx.lineTo(cx - 20, cy + 20); ctx.stroke();
      break;
  }
}

/** Tela do monitor: apagada, ou "código" rolando + barra de progresso. */
export function drawScreen(ctx: CanvasRenderingContext2D, status: AgentStatus, color: string,
                           progress: number, t: number, message?: string) {
  const { width: w, height: h } = ctx.canvas;
  const active = status !== 'DISPONIVEL';
  ctx.fillStyle = active ? '#0f1220' : '#121214';
  ctx.fillRect(0, 0, w, h);
  if (!active) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.font = '600 22px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('zZ', w / 2, h / 2 + 8);
    ctx.textAlign = 'left';
    return;
  }
  // linhas de "código"
  const scroll = Math.floor(t * 6);
  for (let i = 0; i < 7; i++) {
    const seed = Math.sin((i + scroll) * 12.9898) * 43758.5453;
    const len = 40 + Math.abs(seed % 1) * 140;
    const indent = (Math.abs(Math.floor(seed)) % 3) * 16;
    ctx.fillStyle = i % 3 === 0 ? color : 'rgba(220,225,255,0.55)';
    ctx.globalAlpha = status === 'TRABALHANDO' ? 0.9 : 0.4;
    ctx.fillRect(14 + indent, 14 + i * 16, len, 7);
  }
  ctx.globalAlpha = 1;
  if (message) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 15px Inter, sans-serif';
    ctx.fillText(message.slice(0, 26), 14, h - 34);
  }
  // barra
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(14, h - 20, w - 28, 8);
  ctx.fillStyle = status === 'ERRO' ? '#e25b5b' : status === 'CONCLUIDO' ? '#57c78a' : color;
  ctx.fillRect(14, h - 20, ((w - 28) * progress) / 100, 8);
}
