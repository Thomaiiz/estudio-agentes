package br.com.estudio.agentes.service;

import br.com.estudio.agentes.dao.AgentDao;
import br.com.estudio.agentes.dto.AgentEvent;
import br.com.estudio.agentes.dto.AgentEvent.EventType;
import br.com.estudio.agentes.model.Agent;
import br.com.estudio.agentes.model.AgentStatus;
import br.com.estudio.agentes.websocket.AgentEventBroadcaster;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class AgentService {

    public static final int MAX_AGENTS = 16;
    private static final Set<String> BODIES = Set.of("BLOCOS", "NUVEM", "ESTRELA");
    private static final Set<String> EYES = Set.of("PONTOS", "CHEVRON", "PROMPT");
    private static final Set<String> PROVIDERS = Set.of("CLAUDE", "OPENAI", "GEMINI", "LOCAL");
    private static final Set<String> EFFORTS = Set.of("BAIXO", "MEDIO", "ALTO", "MUITO_ALTO", "MAXIMO");
    private static final Pattern COLOR = Pattern.compile("^#[0-9A-Fa-f]{6}$");

    private final AgentDao agentDao;
    private final AgentEventBroadcaster broadcaster;

    public AgentService(AgentDao agentDao, AgentEventBroadcaster broadcaster) {
        this.agentDao = agentDao;
        this.broadcaster = broadcaster;
    }

    public List<Agent> list() {
        return agentDao.findAll();
    }

    public Agent get(Long id) {
        return agentDao.findById(id).orElseThrow(() -> new NotFoundException("Agente " + id + " não encontrado"));
    }

    public Agent create(Agent agent) {
        if (agentDao.findAll().size() >= MAX_AGENTS) {
            throw new IllegalArgumentException("O escritório comporta no máximo " + MAX_AGENTS + " agentes");
        }
        normalizeAndValidate(agent);
        agent.setDeskIndex(agentDao.nextDeskIndex());
        agent.setStatus(AgentStatus.DISPONIVEL);
        Agent saved = agentDao.insert(agent);
        broadcaster.broadcast(AgentEvent.ofAgent(EventType.AGENT_CREATED, saved));
        return saved;
    }

    public Agent update(Long id, Agent changes) {
        Agent current = get(id);
        changes.setId(id);
        normalizeAndValidate(changes);
        agentDao.update(changes);
        Agent saved = get(current.getId());
        broadcaster.broadcast(AgentEvent.ofAgent(EventType.AGENT_UPDATED, saved));
        return saved;
    }

    public void delete(Long id) {
        Agent agent = get(id);
        agentDao.delete(id);
        // tira o agente removido das equipes dos outros
        for (Agent other : agentDao.findAll()) {
            if (other.getTeamIds().remove(id)) {
                agentDao.update(other);
                broadcaster.broadcast(AgentEvent.ofAgent(EventType.AGENT_UPDATED, other));
            }
        }
        broadcaster.broadcast(AgentEvent.ofAgent(EventType.AGENT_DELETED, agent));
    }

    public void changeStatus(Agent agent, AgentStatus status) {
        agent.setStatus(status);
        agentDao.updateStatus(agent.getId(), status);
    }

    private void normalizeAndValidate(Agent a) {
        if (a.getName() == null || a.getName().isBlank()) throw new IllegalArgumentException("Nome é obrigatório");
        a.setName(a.getName().trim());
        if (a.getName().length() > 60) throw new IllegalArgumentException("Nome muito longo");
        a.setProvider(upperOr(a.getProvider(), "CLAUDE"));
        a.setEffort(upperOr(a.getEffort(), "MEDIO"));
        a.setBody(upperOr(a.getBody(), "BLOCOS"));
        a.setEyes(upperOr(a.getEyes(), "PONTOS"));
        if (a.getColor() == null) a.setColor("#7B8CDE");
        check(PROVIDERS, a.getProvider(), "provedor");
        check(EFFORTS, a.getEffort(), "esforço");
        check(BODIES, a.getBody(), "corpo");
        check(EYES, a.getEyes(), "olhos");
        if (!COLOR.matcher(a.getColor()).matches()) throw new IllegalArgumentException("Cor inválida: use #RRGGBB");
        var team = a.getTeamIds().stream().distinct().filter(id -> !id.equals(a.getId())).toList();
        if (team.size() > 3) throw new IllegalArgumentException("A equipe fixa tem no máximo 3 agentes");
        for (Long id : team) {
            if (agentDao.findById(id).isEmpty()) throw new IllegalArgumentException("Agente da equipe não existe: " + id);
        }
        a.setTeamIds(team);
    }

    private static String upperOr(String v, String def) {
        return v == null || v.isBlank() ? def : v.trim().toUpperCase();
    }

    private static void check(Set<String> allowed, String value, String field) {
        if (!allowed.contains(value)) {
            throw new IllegalArgumentException("Valor inválido para " + field + ": " + value + " (use " + allowed + ")");
        }
    }
}
