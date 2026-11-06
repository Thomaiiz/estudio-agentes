package br.com.estudio.agentes.websocket;

import br.com.estudio.agentes.dto.TaskRequest;
import br.com.estudio.agentes.service.TaskService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Map;

/**
 * Endpoint /ws/agents.
 * Servidor -> cliente: {@link br.com.estudio.agentes.dto.AgentEvent} em JSON.
 * Cliente -> servidor: {"action":"ASSIGN_TASK","agentId":1,"title":"...","description":"..."}
 *                      {"action":"PING"}
 */
@Component
public class AgentWebSocketHandler extends TextWebSocketHandler {

    private final AgentEventBroadcaster broadcaster;
    private final TaskService taskService;
    private final ObjectMapper mapper;

    public AgentWebSocketHandler(AgentEventBroadcaster broadcaster, TaskService taskService, ObjectMapper mapper) {
        this.broadcaster = broadcaster;
        this.taskService = taskService;
        this.mapper = mapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        broadcaster.register(session);
        broadcaster.sendTo(session, Map.of("type", "CONNECTED", "clients", broadcaster.connectedClients()));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        try {
            JsonNode node = mapper.readTree(message.getPayload());
            String action = node.path("action").asText("");
            switch (action) {
                case "ASSIGN_TASK" -> {
                    long agentId = node.path("agentId").asLong();
                    var request = new TaskRequest(node.path("title").asText(null),
                            node.path("description").asText(null));
                    var task = taskService.assign(agentId, request);
                    broadcaster.sendTo(session, Map.of("type", "ACK", "taskId", task.getId()));
                }
                case "PING" -> broadcaster.sendTo(session, Map.of("type", "PONG"));
                default -> broadcaster.sendTo(session, Map.of("type", "ERROR", "message", "Ação desconhecida: " + action));
            }
        } catch (Exception e) {
            String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            broadcaster.sendTo(session, Map.of("type", "ERROR", "message", msg));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        broadcaster.unregister(session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        broadcaster.unregister(session);
    }
}
