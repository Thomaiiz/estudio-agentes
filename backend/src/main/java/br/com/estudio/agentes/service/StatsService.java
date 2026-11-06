package br.com.estudio.agentes.service;

import br.com.estudio.agentes.dao.AgentDao;
import br.com.estudio.agentes.dao.TaskDao;
import br.com.estudio.agentes.dto.ProviderStats;
import br.com.estudio.agentes.dto.StatsResponse;
import br.com.estudio.agentes.model.Agent;
import br.com.estudio.agentes.model.Task;
import br.com.estudio.agentes.model.TaskStatus;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class StatsService {

    private final AgentDao agentDao;
    private final TaskDao taskDao;

    public StatsService(AgentDao agentDao, TaskDao taskDao) {
        this.agentDao = agentDao;
        this.taskDao = taskDao;
    }

    public StatsResponse compute() {
        List<Agent> agents = agentDao.findAll();
        Map<Long, Agent> byId = agents.stream().collect(Collectors.toMap(Agent::getId, Function.identity()));
        List<Task> tasks = taskDao.findRecent(10_000);

        Map<String, int[]> counters = new TreeMap<>();      // agents, tasks, completed, failed
        Map<String, Long> durations = new TreeMap<>();
        agents.forEach(a -> counters.computeIfAbsent(a.getProvider(), p -> new int[4])[0]++);

        int completed = 0, running = 0;
        long totalDuration = 0;
        for (Task t : tasks) {
            Agent a = byId.get(t.getAgentId());
            if (a == null) continue;
            int[] c = counters.computeIfAbsent(a.getProvider(), p -> new int[4]);
            c[1]++;
            if (t.getStatus() == TaskStatus.CONCLUIDA) { c[2]++; completed++; }
            if (t.getStatus() == TaskStatus.FALHOU) c[3]++;
            if (t.getStatus() == TaskStatus.EM_ANDAMENTO || t.getStatus() == TaskStatus.NA_FILA) running++;
            if (t.getStartedAt() != null && t.getFinishedAt() != null) {
                long d = Duration.between(t.getStartedAt(), t.getFinishedAt()).toMillis();
                durations.merge(a.getProvider(), d, Long::sum);
                totalDuration += d;
            }
        }
        List<ProviderStats> providers = new ArrayList<>();
        counters.forEach((p, c) -> providers.add(
                new ProviderStats(p, c[0], c[1], c[2], c[3], durations.getOrDefault(p, 0L))));
        return new StatsResponse(tasks.size(), completed, running, totalDuration, providers);
    }
}
