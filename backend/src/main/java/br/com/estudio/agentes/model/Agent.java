package br.com.estudio.agentes.model;

import java.util.ArrayList;
import java.util.List;

/** Entidade de domínio: um agente de IA com sua aparência e configuração. */
public class Agent {
    private Long id;
    private String name;
    private String role;
    private String provider;   // CLAUDE, OPENAI, GEMINI, LOCAL
    private String model;
    private String effort;     // BAIXO, MEDIO, ALTO, MUITO_ALTO, MAXIMO
    private String color;      // #RRGGBB
    private String body;       // BLOCOS, NUVEM, ESTRELA
    private String eyes;       // PONTOS, CHEVRON, PROMPT
    private boolean antennas;
    /** Orquestrador: em vez de executar sozinho, divide a tarefa com o time e integra as entregas. */
    private boolean orchestrator;
    private List<String> tools = new ArrayList<>();
    private String spec;
    /** Equipe fixa: até 3 agentes que entram junto quando este é escalado. */
    private List<Long> teamIds = new ArrayList<>();
    private int deskIndex;
    private AgentStatus status = AgentStatus.DISPONIVEL;
    private int completedTasks;
    private long lastDurationMs;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public String getEffort() { return effort; }
    public void setEffort(String effort) { this.effort = effort; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public String getBody() { return body; }
    public void setBody(String body) { this.body = body; }
    public String getEyes() { return eyes; }
    public void setEyes(String eyes) { this.eyes = eyes; }
    public boolean isAntennas() { return antennas; }
    public void setAntennas(boolean antennas) { this.antennas = antennas; }
    public boolean isOrchestrator() { return orchestrator; }
    public void setOrchestrator(boolean orchestrator) { this.orchestrator = orchestrator; }
    public List<String> getTools() { return tools; }
    public void setTools(List<String> tools) { this.tools = tools == null ? new ArrayList<>() : tools; }
    public List<Long> getTeamIds() { return teamIds; }
    public void setTeamIds(List<Long> teamIds) { this.teamIds = teamIds == null ? new ArrayList<>() : new ArrayList<>(teamIds); }
    public String getSpec() { return spec; }
    public void setSpec(String spec) { this.spec = spec; }
    public int getDeskIndex() { return deskIndex; }
    public void setDeskIndex(int deskIndex) { this.deskIndex = deskIndex; }
    public AgentStatus getStatus() { return status; }
    public void setStatus(AgentStatus status) { this.status = status; }
    public int getCompletedTasks() { return completedTasks; }
    public void setCompletedTasks(int completedTasks) { this.completedTasks = completedTasks; }
    public long getLastDurationMs() { return lastDurationMs; }
    public void setLastDurationMs(long lastDurationMs) { this.lastDurationMs = lastDurationMs; }
}
