package br.com.estudio.agentes.websocket;

import br.com.estudio.agentes.dto.AgentEvent;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Mantém as sessões WebSocket abertas e envia cada evento para todas elas. */
@Component
public class AgentEventBroadcaster {

    private static final Logger log = LoggerFactory.getLogger(AgentEventBroadcaster.class);
    private static final int SEND_TIME_LIMIT_MS = 5_000;
    private static final int BUFFER_LIMIT_BYTES = 512 * 1024;

    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
    private final ObjectMapper mapper;

    public AgentEventBroadcaster(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public void register(WebSocketSession session) {
        // O decorator serializa envios concorrentes (várias threads de agentes publicam ao mesmo tempo).
        sessions.put(session.getId(),
                new ConcurrentWebSocketSessionDecorator(session, SEND_TIME_LIMIT_MS, BUFFER_LIMIT_BYTES));
    }

    public void unregister(WebSocketSession session) {
        sessions.remove(session.getId());
    }

    public int connectedClients() {
        return sessions.size();
    }

    public void broadcast(AgentEvent event) {
        String json;
        try {
            json = mapper.writeValueAsString(event);
        } catch (JsonProcessingException e) {
            log.error("Não foi possível serializar o evento {}", event.type(), e);
            return;
        }
        TextMessage message = new TextMessage(json);
        sessions.values().forEach(s -> send(s, message));
    }

    public void sendTo(WebSocketSession session, Object payload) {
        try {
            WebSocketSession target = sessions.getOrDefault(session.getId(), session);
            send(target, new TextMessage(mapper.writeValueAsString(payload)));
        } catch (JsonProcessingException e) {
            log.error("Falha ao serializar resposta", e);
        }
    }

    private void send(WebSocketSession session, TextMessage message) {
        if (!session.isOpen()) {
            sessions.remove(session.getId());
            return;
        }
        try {
            session.sendMessage(message);
        } catch (IOException | IllegalStateException e) {
            log.debug("Removendo sessão {}: {}", session.getId(), e.getMessage());
            sessions.remove(session.getId());
        }
    }
}
