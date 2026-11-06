package br.com.estudio.agentes.model;

import java.time.Instant;

/** Entidade de domínio: uma tarefa atribuída a um agente. */
public class Task {
    private Long id;
    private Long agentId;
    /** Tarefa que originou esta (orquestrador ou equipe fixa). */
    private Long parentId;
    /** Pasta do projeto onde o agente trabalha (compartilhada por toda a árvore de tarefas). */
    private String workspace;
    private String title;
    private String description;
    private TaskStatus status = TaskStatus.NA_FILA;
    private int progress;
    private String result;
    private Instant createdAt;
    private Instant startedAt;
    private Instant finishedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getAgentId() { return agentId; }
    public void setAgentId(Long agentId) { this.agentId = agentId; }
    public Long getParentId() { return parentId; }
    public void setParentId(Long parentId) { this.parentId = parentId; }
    public String getWorkspace() { return workspace; }
    public void setWorkspace(String workspace) { this.workspace = workspace; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public TaskStatus getStatus() { return status; }
    public void setStatus(TaskStatus status) { this.status = status; }
    public int getProgress() { return progress; }
    public void setProgress(int progress) { this.progress = progress; }
    public String getResult() { return result; }
    public void setResult(String result) { this.result = result; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getStartedAt() { return startedAt; }
    public void setStartedAt(Instant startedAt) { this.startedAt = startedAt; }
    public Instant getFinishedAt() { return finishedAt; }
    public void setFinishedAt(Instant finishedAt) { this.finishedAt = finishedAt; }
}
