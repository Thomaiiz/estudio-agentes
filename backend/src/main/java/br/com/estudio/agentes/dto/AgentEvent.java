package br.com.estudio.agentes.dto;

import br.com.estudio.agentes.model.Agent;
import br.com.estudio.agentes.model.AgentStatus;
import br.com.estudio.agentes.model.Task;

import java.time.Instant;

/**
 * Mensagem enviada pelo WebSocket para todos os painéis conectados.
 * O frontend usa {@code type} para decidir o feedback visual no escritório 3D.
 */
public record AgentEvent(
        EventType type,
        Long agentId,
        AgentStatus agentStatus,
        Task task,
        Agent agent,
        String message,
        Instant timestamp
) {
    public enum EventType {
        AGENT_CREATED, AGENT_UPDATED, AGENT_DELETED,
        TASK_RECEIVED, TASK_STARTED, TASK_PROGRESS, TASK_COMPLETED, TASK_FAILED
    }

    public static AgentEvent ofTask(EventType type, Agent agent, Task task, String message) {
        return new AgentEvent(type, agent.getId(), agent.getStatus(), task, null, message, Instant.now());
    }

    public static AgentEvent ofAgent(EventType type, Agent agent) {
        return new AgentEvent(type, agent.getId(), agent.getStatus(), null, agent, null, Instant.now());
    }
}
