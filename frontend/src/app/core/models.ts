export type AgentStatus = 'DISPONIVEL' | 'RECEBENDO' | 'PENSANDO' | 'TRABALHANDO' | 'CONCLUIDO' | 'ERRO';
export type TaskStatus = 'NA_FILA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'FALHOU';
export type Body = 'BLOCOS' | 'NUVEM' | 'ESTRELA';
export type Eyes = 'PONTOS' | 'CHEVRON' | 'PROMPT';
export type Provider = 'CLAUDE' | 'OPENAI' | 'GEMINI' | 'LOCAL';
export type Effort = 'BAIXO' | 'MEDIO' | 'ALTO' | 'MUITO_ALTO' | 'MAXIMO';

export interface Agent {
  id: number;
  name: string;
  role: string;
  provider: Provider;
  model: string;
  effort: Effort;
  color: string;
  body: Body;
  eyes: Eyes;
  antennas: boolean;
  orchestrator: boolean;
  tools: string[];
  spec: string;
  teamIds: number[];
  deskIndex: number;
  status: AgentStatus;
  completedTasks: number;
  lastDurationMs: number;
}

export interface Task {
  id: number;
  agentId: number;
  parentId?: number | null;
  workspace?: string | null;
  title: string;
  description?: string;
  status: TaskStatus;
  progress: number;
  result?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export type EventType =
  | 'AGENT_CREATED' | 'AGENT_UPDATED' | 'AGENT_DELETED'
  | 'TASK_RECEIVED' | 'TASK_STARTED' | 'TASK_PROGRESS' | 'TASK_COMPLETED' | 'TASK_FAILED';

export interface AgentEvent {
  type: EventType;
  agentId: number;
  agentStatus: AgentStatus;
  task?: Task | null;
  agent?: Agent | null;
  message?: string | null;
  timestamp: string;
}

export interface ProjectFile {
  path: string;
  size: number;
  modifiedAt: string;
  changed: boolean;
}

export interface ProjectFiles {
  taskId: number;
  agentId: number;
  title: string;
  status: TaskStatus;
  workspace: string;
  startedAt?: string;
  finishedAt?: string;
  result?: string;
  files: ProjectFile[];
}

export interface ProviderStats {
  provider: Provider;
  agents: number;
  tasks: number;
  completed: number;
  failed: number;
  totalDurationMs: number;
}

export interface Stats {
  totalTasks: number;
  completedTasks: number;
  runningTasks: number;
  totalDurationMs: number;
  providers: ProviderStats[];
}

export const STATUS_LABEL: Record<AgentStatus, string> = {
  DISPONIVEL: 'Disponível',
  RECEBENDO: 'Recebendo tarefa',
  PENSANDO: 'Pensando',
  TRABALHANDO: 'Trabalhando',
  CONCLUIDO: 'Concluiu!',
  ERRO: 'Erro',
};

export const PROVIDER_LABEL: Record<Provider, string> = {
  CLAUDE: 'Claude', OPENAI: 'OpenAI', GEMINI: 'Gemini', LOCAL: 'Local',
};

export const EFFORTS: { id: Effort; label: string }[] = [
  { id: 'BAIXO', label: 'Baixo' }, { id: 'MEDIO', label: 'Médio' }, { id: 'ALTO', label: 'Alto' },
  { id: 'MUITO_ALTO', label: 'Muito alto' }, { id: 'MAXIMO', label: 'Máximo' },
];

export const TOOLS: { id: string; label: string }[] = [
  { id: 'LER_ARQUIVOS', label: 'Ler arquivos' },
  { id: 'ACHAR_ARQUIVOS', label: 'Achar arquivos' },
  { id: 'BUSCAR_CODIGO', label: 'Buscar no código' },
  { id: 'EDITAR_ARQUIVOS', label: 'Editar arquivos' },
  { id: 'CRIAR_ARQUIVOS', label: 'Criar arquivos' },
  { id: 'RODAR_COMANDOS', label: 'Rodar comandos' },
  { id: 'PESQUISAR_WEB', label: 'Pesquisar na web' },
  { id: 'ABRIR_PAGINAS', label: 'Abrir páginas' },
];

export function formatDuration(ms: number): string {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${s % 60} s`;
}

/** Algo que o time aprendeu. agentIds vazio = vale para todos. */
export interface Knowledge {
  id: string;
  title: string;
  source: string;
  agentIds: number[];
  createdAt: string;
  content: string;
}

export interface VideoStudy {
  taskId: number;
  agentId: number;
  agentName: string;
  videoTitle: string;
}
