import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Agent, Knowledge, ProjectFiles, Stats, Task, VideoStudy } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  agents() { return this.http.get<Agent[]>('/api/agents'); }
  agent(id: number) { return this.http.get<Agent>(`/api/agents/${id}`); }
  createAgent(a: Partial<Agent>) { return this.http.post<Agent>('/api/agents', a); }
  updateAgent(id: number, a: Partial<Agent>) { return this.http.put<Agent>(`/api/agents/${id}`, a); }
  deleteAgent(id: number) { return this.http.delete<void>(`/api/agents/${id}`); }
  assignTask(agentId: number, title: string, description?: string) {
    return this.http.post<Task>(`/api/agents/${agentId}/tasks`, { title, description });
  }
  stopAgent(agentId: number) { return this.http.post<{ paradas: number }>(`/api/agents/${agentId}/stop`, {}); }
  recentTasks(limit = 30) { return this.http.get<Task[]>(`/api/tasks?limit=${limit}`); }
  agentTasks(agentId: number, limit = 5) { return this.http.get<Task[]>(`/api/agents/${agentId}/tasks?limit=${limit}`); }
  files(taskId: number) { return this.http.get<ProjectFiles>(`/api/tasks/${taskId}/files`); }
  rawUrl(taskId: number, path: string) {
    return `/api/tasks/${taskId}/raw/${path.split('/').map(encodeURIComponent).join('/')}`;
  }
  rawText(taskId: number, path: string) { return this.http.get(this.rawUrl(taskId, path), { responseType: 'text' }); }
  stats() { return this.http.get<Stats>('/api/stats'); }
  knowledge() { return this.http.get<Knowledge[]>('/api/conhecimento'); }
  addKnowledge(title: string, content: string, agentIds: number[], source = '') {
    return this.http.post<Knowledge>('/api/conhecimento', { title, content, source, agentIds });
  }
  learnVideo(url: string, agentIds: number[]) { return this.http.post<VideoStudy>('/api/conhecimento/video', { url, agentIds }); }
  deleteKnowledge(id: string) { return this.http.delete<void>(`/api/conhecimento/${encodeURIComponent(id)}`); }
}
