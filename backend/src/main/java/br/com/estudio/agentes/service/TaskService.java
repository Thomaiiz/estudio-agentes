package br.com.estudio.agentes.service;

import br.com.estudio.agentes.dao.AgentDao;
import br.com.estudio.agentes.dao.TaskDao;
import br.com.estudio.agentes.dto.AgentEvent;
import br.com.estudio.agentes.dto.AgentEvent.EventType;
import br.com.estudio.agentes.dto.TaskRequest;
import br.com.estudio.agentes.model.Agent;
import br.com.estudio.agentes.model.AgentStatus;
import br.com.estudio.agentes.model.Task;
import br.com.estudio.agentes.model.TaskStatus;
import br.com.estudio.agentes.websocket.AgentEventBroadcaster;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Normalizer;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;

/**
 * Recebe tarefas e as executa em segundo plano, uma de cada vez por agente (fila própria),
 * publicando cada mudança de estado pelo WebSocket.
 * Toda tarefa "raiz" ganha uma pasta de projeto; as tarefas derivadas (equipe fixa, orquestrador)
 * trabalham na mesma pasta.
 */
@Service
public class TaskService {

    private static final Logger log = LoggerFactory.getLogger(TaskService.class);
    /** Quanto tempo o agente fica "comemorando" antes de voltar a ficar disponível. */
    private static final long CELEBRATION_MS = 2500;
    /** Funções que trabalham depois dos outros, sobre o que já foi feito. */
    private static final Pattern REVIEW_PHASE = Pattern.compile("(?i).*(revis|test|qualidade).*");

    private final AgentService agentService;
    private final AgentDao agentDao;
    private final TaskDao taskDao;
    private final AgentRunner runner;
    private final AgentEventBroadcaster broadcaster;
    private final Path workspaceRoot;
    private final long orchestrationTimeoutMs;

    private final Map<Long, ExecutorService> queues = new ConcurrentHashMap<>();
    private final Map<Long, AtomicInteger> pending = new ConcurrentHashMap<>();
    /** Tarefas que o usuário mandou parar. */
    private final java.util.Set<Long> cancelled = ConcurrentHashMap.newKeySet();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    public TaskService(AgentService agentService, AgentDao agentDao, TaskDao taskDao,
                       AgentRunner runner, AgentEventBroadcaster broadcaster,
                       @Value("${estudio.runner.workspace}") String workspaceRoot,
                       @Value("${estudio.runner.timeout-min:20}") long timeoutMin) {
        this.agentService = agentService;
        this.agentDao = agentDao;
        this.taskDao = taskDao;
        this.runner = runner;
        this.broadcaster = broadcaster;
        this.workspaceRoot = Path.of(workspaceRoot).toAbsolutePath().normalize();
        this.orchestrationTimeoutMs = Duration.ofMinutes(timeoutMin * 4).toMillis();
    }

    /**
     * Atribui a tarefa ao agente e, se ele tiver equipe fixa, cada colega recebe a sua parte.
     */
    public Task assign(Long agentId, TaskRequest request) {
        Task main = assignSingle(agentId, request, null);
        Agent lead = agentService.get(agentId);
        for (Long mateId : lead.getTeamIds()) {
            agentDao.findById(mateId).ifPresent(mate -> assignSingle(mateId,
                    new TaskRequest(cut("%s: %s".formatted(roleOf(mate), main.getTitle())),
                            "Parte da equipe fixa de %s. Pedido original: %s%s".formatted(lead.getName(),
                                    main.getTitle(), main.getDescription() == null ? "" : "\n\n" + main.getDescription())),
                    main));
        }
        return main;
    }

    private Task assignSingle(Long agentId, TaskRequest request, Task parent) {
        if (request == null || request.title() == null || request.title().isBlank()) {
            throw new IllegalArgumentException("Título da tarefa é obrigatório");
        }
        Agent agent = agentService.get(agentId);

        Task task = new Task();
        task.setAgentId(agentId);
        task.setTitle(request.title().trim());
        task.setDescription(request.description());
        task.setStatus(TaskStatus.NA_FILA);
        task.setCreatedAt(Instant.now());
        if (parent != null) {
            task.setParentId(parent.getId());
            task.setWorkspace(parent.getWorkspace());
        }
        taskDao.insert(task);
        if (parent == null) {
            task.setWorkspace(workspaceRoot.resolve(slug(task.getTitle()) + "-" + task.getId()).toString());
            taskDao.update(task);
        }

        int queued = pending.computeIfAbsent(agentId, k -> new AtomicInteger()).incrementAndGet();
        if (queued == 1) {
            agentService.changeStatus(agent, AgentStatus.RECEBENDO);
        }
        broadcaster.broadcast(AgentEvent.ofTask(EventType.TASK_RECEIVED, agent, task,
                queued == 1 ? "Nova tarefa recebida!" : "Tarefa na fila (" + (queued - 1) + " antes)"));

        queues.computeIfAbsent(agentId, k -> Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "agente-" + k);
            t.setDaemon(true);
            return t;
        })).submit(() -> execute(agentId, task));
        return task;
    }

    private void execute(Long agentId, Task task) {
        Agent agent = agentDao.findById(agentId).orElse(null);
        if (agent == null) return; // agente removido enquanto a tarefa esperava

        task.setStatus(TaskStatus.EM_ANDAMENTO);
        task.setStartedAt(Instant.now());
        taskDao.update(task);
        agentService.changeStatus(agent, AgentStatus.PENSANDO);
        broadcaster.broadcast(AgentEvent.ofTask(EventType.TASK_STARTED, agent, task, "Pensando..."));

        try {
            checkStop(task);
            Files.createDirectories(Path.of(task.getWorkspace()));
            AgentRunner.ProgressListener listener = (progress, message) -> {
                task.setProgress(Math.max(0, Math.min(99, progress)));
                taskDao.update(task);
                if (agent.getStatus() != AgentStatus.TRABALHANDO) {
                    agentService.changeStatus(agent, AgentStatus.TRABALHANDO);
                }
                broadcaster.broadcast(AgentEvent.ofTask(EventType.TASK_PROGRESS, agent, task, message));
            };
            String result = agent.isOrchestrator()
                    ? orchestrate(agent, task, listener)
                    : runner.run(agent, task, listener);
            checkStop(task);
            task.setStatus(TaskStatus.CONCLUIDA);
            task.setProgress(100);
            task.setResult(result);
            task.setFinishedAt(Instant.now());
            taskDao.update(task);
            long duration = Duration.between(task.getStartedAt(), task.getFinishedAt()).toMillis();
            agentDao.registerCompletion(agentId, duration);
            agentService.changeStatus(agent, AgentStatus.CONCLUIDO);
            broadcaster.broadcast(AgentEvent.ofTask(EventType.TASK_COMPLETED, agent, task, "Pronto!"));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            fail(agent, task, cancelled.contains(task.getId()) ? STOPPED : "Interrompida");
        } catch (Exception e) {
            log.warn("Falha na tarefa {} do agente {}: {}", task.getId(), agentId, e.getMessage());
            fail(agent, task, cancelled.contains(task.getId()) ? STOPPED : e.getMessage());
        } finally {
            cancelled.remove(task.getId());
            int left = pending.get(agentId).decrementAndGet();
            if (left == 0) {
                scheduler.schedule(() -> backToIdle(agentId), CELEBRATION_MS, TimeUnit.MILLISECONDS);
            }
        }
    }

    private static final String STOPPED = "Parada pelo usuário";

    private void checkStop(Task task) {
        if (cancelled.contains(task.getId())) throw new IllegalStateException(STOPPED);
    }

    /**
     * Botão "Parar": encerra a tarefa em andamento do agente e esvazia a fila dele.
     * Se for o orquestrador, as partes que ele delegou também param.
     * @return quantas tarefas foram paradas
     */
    public int stopAgent(Long agentId) {
        agentService.get(agentId); // 404 se não existir
        int count = 0;
        for (Task t : taskDao.findByAgent(agentId, 200)) {
            count += stopTask(t);
        }
        return count;
    }

    private int stopTask(Task t) {
        if (t.getStatus() != TaskStatus.NA_FILA && t.getStatus() != TaskStatus.EM_ANDAMENTO) return 0;
        int count = cancelled.add(t.getId()) ? 1 : 0;
        runner.cancel(t.getId());
        for (Task child : taskDao.findChildren(t.getId())) {
            count += stopTask(child);
        }
        return count;
    }

    /**
     * O orquestrador trabalha em etapas:
     * 1) escreve o PLANO.md do projeto;
     * 2) delega uma parte para cada agente de construção (em paralelo);
     * 3) depois, revisão e testes;
     * 4) integra tudo e escreve o README.md.
     */
    private String orchestrate(Agent lead, Task task, AgentRunner.ProgressListener listener) throws Exception {
        List<Agent> team = agentDao.findAll().stream()
                .filter(a -> !a.getId().equals(lead.getId()) && !a.isOrchestrator())
                .toList();
        if (team.isEmpty()) {
            return runner.run(lead, task, listener); // ninguém para delegar: faz sozinho
        }
        List<Agent> builders = team.stream().filter(a -> !REVIEW_PHASE.matcher(roleOf(a)).matches()).toList();
        List<Agent> reviewers = team.stream().filter(a -> REVIEW_PHASE.matcher(roleOf(a)).matches()).toList();
        String original = task.getTitle() + (task.getDescription() == null ? "" : "\n\n" + task.getDescription());

        // 1) plano
        String roster = team.stream().map(a -> "- " + a.getName() + ": " + roleOf(a)).reduce((a, b) -> a + "\n" + b).orElse("");
        try {
            runner.run(lead, subTask(task, "Planejar: " + task.getTitle(), """
                Escreva o arquivo PLANO.md nesta pasta, para o time abaixo seguir. NÃO implemente nada ainda.
                O plano deve ter: objetivo, tecnologias escolhidas (simples e fáceis de rodar), estrutura de pastas
                e o que cada agente deve entregar, com nomes de arquivos.

                Time:
                %s

                Pedido original:
                %s""".formatted(roster, original)), scaled(listener, 0, 15, "Planejando"));
        } catch (Exception e) {
            checkStop(task);
            // sem plano o time ainda consegue trabalhar a partir do pedido original
            log.warn("Plano da tarefa {} falhou: {}", task.getId(), e.getMessage());
            listener.onProgress(15, "Não consegui escrever o plano; o time segue pelo pedido original");
        }

        checkStop(task);
        // 2) construção e 3) revisão/testes
        int total = builders.size() + reviewers.size();
        AtomicInteger delivered = new AtomicInteger();
        List<Long> children = new ArrayList<>();
        children.addAll(delegateAndWait(lead, task, builders, original, listener, delivered, total));
        checkStop(task);
        children.addAll(delegateAndWait(lead, task, reviewers, original, listener, delivered, total));
        checkStop(task);
        List<String> ok = new ArrayList<>(), failed = new ArrayList<>();
        for (Long id : children) {
            taskDao.findById(id).ifPresent(t -> {
                String who = agentDao.findById(t.getAgentId()).map(Agent::getName).orElse("#" + t.getAgentId());
                (t.getStatus() == TaskStatus.CONCLUIDA ? ok : failed).add(who);
            });
        }
        if (ok.isEmpty()) {
            throw new IllegalStateException("Ninguém do time conseguiu entregar (" + String.join(", ", failed)
                    + "). Abra a tarefa de cada um para ver o motivo.");
        }
        String report = "Entregaram: " + String.join(", ", ok)
                + (failed.isEmpty() ? "" : "\nFalharam: " + String.join(", ", failed));

        // 4) integração
        String summary;
        try {
            summary = runner.run(lead, subTask(task, "Integrar: " + task.getTitle(), """
                O time terminou as partes do PLANO.md nesta pasta. Revise o conjunto: ajuste o que não encaixa
                (imports, caminhos, nomes), sem reescrever o trabalho dos outros. Por fim, escreva um README.md
                curto dizendo como abrir ou rodar o projeto.

                Pedido original:
                %s""".formatted(original)), scaled(listener, 85, 99, "Integrando"));
        } catch (Exception e) {
            checkStop(task);
            // as entregas do time continuam na pasta; só a costura final não aconteceu
            log.warn("Integração da tarefa {} falhou: {}", task.getId(), e.getMessage());
            summary = "A integração final não rodou: " + e.getMessage();
        }
        return report + "\n\n" + summary;
    }

    private List<Long> delegateAndWait(Agent lead, Task task, List<Agent> agents, String original,
                                       AgentRunner.ProgressListener listener, AtomicInteger delivered, int total)
            throws InterruptedException {
        if (agents.isEmpty()) return List.of();
        List<Long> children = new ArrayList<>();
        for (Agent mate : agents) {
            children.add(assignSingle(mate.getId(), new TaskRequest(
                    cut("%s: %s".formatted(roleOf(mate), task.getTitle())),
                    "Parte delegada por %s. Siga o PLANO.md desta pasta.\n\nPedido original: %s"
                            .formatted(lead.getName(), original)), task).getId());
        }
        listener.onProgress(15 + 70 * delivered.get() / total,
                "Delegou para " + agents.stream().map(Agent::getName).reduce((a, b) -> a + ", " + b).orElse(""));

        long deadline = System.currentTimeMillis() + orchestrationTimeoutMs;
        int doneHere = 0;
        while (doneHere < children.size()) {
            if (System.currentTimeMillis() > deadline) throw new IllegalStateException("O time não terminou a tempo");
            checkStop(task);
            Thread.sleep(500);
            int done = 0;
            for (Long id : children) {
                TaskStatus st = taskDao.findById(id).map(Task::getStatus).orElse(TaskStatus.FALHOU);
                if (st == TaskStatus.CONCLUIDA || st == TaskStatus.FALHOU) done++;
            }
            if (done != doneHere) {
                delivered.addAndGet(done - doneHere);
                doneHere = done;
                listener.onProgress(15 + 70 * delivered.get() / total, "Entregas: " + delivered.get() + "/" + total);
            }
        }
        return children;
    }

    /** Tarefa interna do orquestrador (não persistida), na mesma pasta da tarefa principal. */
    private static Task subTask(Task parent, String title, String description) {
        Task t = new Task();
        t.setId(parent.getId());
        t.setAgentId(parent.getAgentId());
        t.setTitle(cut(title));
        t.setDescription(description);
        t.setWorkspace(parent.getWorkspace());
        return t;
    }

    /** Converte o progresso 0..100 de uma etapa para a faixa [from, to] da tarefa toda. */
    private static AgentRunner.ProgressListener scaled(AgentRunner.ProgressListener l, int from, int to, String prefix) {
        return (p, msg) -> l.onProgress(from + (to - from) * p / 100, prefix + " · " + msg);
    }

    private void fail(Agent agent, Task task, String reason) {
        task.setStatus(TaskStatus.FALHOU);
        task.setResult(reason);
        task.setFinishedAt(Instant.now());
        taskDao.update(task);
        agentService.changeStatus(agent, AgentStatus.ERRO);
        broadcaster.broadcast(AgentEvent.ofTask(EventType.TASK_FAILED, agent, task, "Falhou: " + reason));
    }

    private void backToIdle(Long agentId) {
        AtomicInteger counter = pending.get(agentId);
        if (counter != null && counter.get() > 0) return; // chegou tarefa nova nesse meio tempo
        agentDao.findById(agentId).ifPresent(agent -> {
            agentService.changeStatus(agent, AgentStatus.DISPONIVEL);
            broadcaster.broadcast(AgentEvent.ofAgent(EventType.AGENT_UPDATED, agent));
        });
    }

    public List<Task> recent(int limit) {
        return taskDao.findRecent(Math.min(Math.max(limit, 1), 200));
    }

    public List<Task> byAgent(Long agentId, int limit) {
        agentService.get(agentId);
        return taskDao.findByAgent(agentId, Math.min(Math.max(limit, 1), 200));
    }

    private static String roleOf(Agent a) {
        return a.getRole() == null || a.getRole().isBlank() ? a.getName() : a.getRole();
    }

    private static String cut(String s) {
        return s.length() > 200 ? s.substring(0, 200) : s;
    }

    static String slug(String text) {
        String s = Normalizer.normalize(text, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (s.length() > 40) s = s.substring(0, 40).replaceAll("-$", "");
        return s.isEmpty() ? "projeto" : s;
    }

    @PreDestroy
    void shutdown() {
        queues.values().forEach(ExecutorService::shutdownNow);
        scheduler.shutdownNow();
    }
}
