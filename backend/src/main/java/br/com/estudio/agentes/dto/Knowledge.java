package br.com.estudio.agentes.dto;

import java.time.Instant;
import java.util.List;

/** Algo que o time aprendeu. agentIds vazio = vale para todos os agentes. */
public record Knowledge(String id, String title, String source, List<Long> agentIds, Instant createdAt, String content) {

    public record CreateRequest(String title, String content, String source, List<Long> agentIds) {}

    public record VideoRequest(String url, List<Long> agentIds) {}
}
