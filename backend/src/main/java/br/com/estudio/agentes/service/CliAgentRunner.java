package br.com.estudio.agentes.service;

import br.com.estudio.agentes.model.Agent;
import br.com.estudio.agentes.model.Task;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Deque;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Executa a tarefa chamando a ferramenta de linha de comando oficial do provedor do agente
 * (Codex para OPENAI, Gemini CLI para GEMINI, Claude Code para CLAUDE), dentro da pasta do projeto.
 * O login é o da própria ferramenta (assinatura do usuário); o estúdio não guarda senha nem chave.
 */
@Component
@ConditionalOnProperty(name = "estudio.runner.mode", havingValue = "cli", matchIfMissing = true)
public class CliAgentRunner implements AgentRunner {

    private static final Logger log = LoggerFactory.getLogger(CliAgentRunner.class);
    private static final boolean WINDOWS = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");

    private final Map<String, List<String>> commands;
    private final String fallbackProvider;
    private final long timeoutMs;
    private final Map<String, Boolean> available = new ConcurrentHashMap<>();
    private final Map<Long, Process> running = new ConcurrentHashMap<>();
    private final java.util.Set<Long> cancelled = ConcurrentHashMap.newKeySet();

    public CliAgentRunner(@Value("${estudio.cli.openai}") String openai,
                          @Value("${estudio.cli.gemini}") String gemini,
                          @Value("${estudio.cli.claude}") String claude,
                          @Value("${estudio.cli.local:}") String local,
                          @Value("${estudio.runner.fallback-provider:OPENAI}") String fallbackProvider,
                          @Value("${estudio.runner.timeout-min:20}") long timeoutMin) {
        this.commands = Map.of(
                "OPENAI", split(openai), "GEMINI", split(gemini),
                "CLAUDE", split(claude), "LOCAL", split(local));
        this.fallbackProvider = fallbackProvider.toUpperCase(Locale.ROOT);
        this.timeoutMs = TimeUnit.MINUTES.toMillis(timeoutMin);
    }

    @Override
    public String run(Agent agent, Task task, ProgressListener listener) throws Exception {
        // ordem de tentativa: o provedor do agente, o reserva e depois qualquer outro instalado
        List<String> order = new ArrayList<>();
        for (String p : List.of(agent.getProvider(), fallbackProvider, "OPENAI", "GEMINI", "CLAUDE")) {
            List<String> c = commands.getOrDefault(p, List.of());
            if (!order.contains(p) && !c.isEmpty() && isInstalled(c.get(0))) order.add(p);
        }
        if (order.isEmpty()) {
            throw new IllegalStateException(("Nenhuma ferramenta de IA encontrada para %s. Instale e faça login: "
                    + "npm i -g @openai/codex (depois: codex) ou npm i -g @google/gemini-cli (depois: gemini)")
                    .formatted(agent.getProvider()));
        }
        if (!order.get(0).equals(agent.getProvider())) {
            listener.onProgress(1, "Sem " + label(agent.getProvider()) + " instalado: usando " + label(order.get(0)));
        }
        IllegalStateException first = null;
        for (int i = 0; i < order.size() && i < 2; i++) { // no máximo uma segunda tentativa
            String provider = order.get(i);
            if (cancelled.remove(task.getId())) throw new IllegalStateException("Parada pelo usuário");
            try {
                return runWith(provider, commands.get(provider), agent, task, listener);
            } catch (CliFailure e) {
                if (cancelled.remove(task.getId())) throw new IllegalStateException("Parada pelo usuário");
                if (first == null) first = e;
                log.warn("[{}] {} falhou: {}", agent.getName(), label(provider), e.getMessage());
                if (e.timeout || i + 1 >= Math.min(order.size(), 2)) break;
                listener.onProgress(3, label(provider) + " falhou, tentando com " + label(order.get(i + 1)));
            }
        }
        throw first;
    }

    /** Falha da ferramenta (código de saída ou tempo esgotado), que pode ser tentada com outro provedor. */
    static final class CliFailure extends IllegalStateException {
        final boolean timeout;
        CliFailure(String msg, boolean timeout) { super(msg); this.timeout = timeout; }
    }

    private String runWith(String provider, List<String> cmd, Agent agent, Task task, ProgressListener listener) throws Exception {
        Path dir = Path.of(task.getWorkspace());
        Files.createDirectories(dir);
        String prompt = buildPrompt(agent, task);

        List<String> full = new ArrayList<>();
        if (WINDOWS) { full.add("cmd.exe"); full.add("/c"); }
        full.addAll(cmd);
        ProcessBuilder pb = new ProcessBuilder(full).directory(dir.toFile()).redirectErrorStream(true);
        log.info("[{}] {} em {}", agent.getName(), String.join(" ", cmd), dir);
        Process process = pb.start();
        running.put(task.getId(), process);
        try {
            return pump(process, provider, prompt, listener);
        } finally {
            running.remove(task.getId(), process);
        }
    }

    @Override
    public void cancel(long taskId) {
        cancelled.add(taskId);
        Process p = running.get(taskId);
        if (p != null) {
            p.descendants().forEach(ProcessHandle::destroyForcibly); // a CLI costuma abrir subprocessos
            p.destroyForcibly();
        }
    }

    private String pump(Process process, String provider, String prompt, ProgressListener listener) throws Exception {
        // vigia: encerra a ferramenta se passar do tempo, mesmo que ela fique em silêncio
        var watchdog = java.util.concurrent.CompletableFuture.runAsync(() -> {
            if (process.isAlive()) process.destroyForcibly();
        }, java.util.concurrent.CompletableFuture.delayedExecutor(timeoutMs, TimeUnit.MILLISECONDS));
        try (OutputStream in = process.getOutputStream()) {
            in.write(prompt.getBytes(StandardCharsets.UTF_8)); // o prompt vai pelo stdin
        }

        Deque<String> tail = new ArrayDeque<>();
        long start = System.currentTimeMillis();
        long lastEmit = 0;
        listener.onProgress(3, "Chamando " + label(provider));
        try (BufferedReader out = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = out.readLine()) != null) {
                String clean = line.replaceAll("\u001B\\[[;\\d]*[A-Za-z]", "").strip();
                if (clean.isEmpty()) continue;
                tail.addLast(clean);
                if (tail.size() > 12) tail.removeFirst();
                long now = System.currentTimeMillis();
                if (now - lastEmit > 1000) {
                    lastEmit = now;
                    // a CLI não informa porcentagem: o progresso cresce com o tempo e nunca passa de 90%
                    int progress = (int) (90 * (1 - Math.exp(-(now - start) / 90_000.0)));
                    listener.onProgress(Math.max(5, progress), clean.length() > 60 ? clean.substring(0, 60) + "…" : clean);
                }
            }
        }
        if (!process.waitFor(30, TimeUnit.SECONDS)) process.destroyForcibly();
        watchdog.cancel(false);
        if (System.currentTimeMillis() - start >= timeoutMs) {
            throw new CliFailure("Tempo esgotado (" + timeoutMs / 60_000 + " min)", true);
        }
        int code = process.waitFor();
        String summary = String.join("\n", tail);
        if (code != 0) {
            throw new CliFailure(label(provider) + " terminou com erro (" + code + "): "
                    + (summary.length() > 400 ? summary.substring(summary.length() - 400) : summary), false);
        }
        return summary.length() > 2000 ? summary.substring(summary.length() - 2000) : summary;
    }

    static String buildPrompt(Agent agent, Task task) {
        return """
                Você é %s, responsável por "%s" num time de agentes de IA que trabalha junto nesta pasta.
                %s

                SUA TAREFA: %s
                %s

                REGRAS:
                - Trabalhe somente dentro da pasta atual. Outros agentes trabalham nela ao mesmo tempo.
                - Se existir PLANO.md, siga-o. Faça só a sua parte; não apague nem reescreva o trabalho dos outros.
                - Organize por área: front-end em frontend/, back-end em backend/, documentação em docs/,
                  arte e imagens em design/, vídeo e animação em midia/, testes em testes/.
                - Não faça perguntas: tome decisões razoáveis e siga em frente.
                - Ao terminar, responda com um resumo de até 5 linhas: o que fez e quais arquivos criou ou alterou.
                """.formatted(agent.getName(), agent.getRole() == null ? "" : agent.getRole(),
                agent.getSpec() == null ? "" : agent.getSpec(),
                task.getTitle(), task.getDescription() == null ? "" : task.getDescription());
    }

    private boolean isInstalled(String command) {
        return available.computeIfAbsent(command, c -> {
            try {
                Process p = (WINDOWS ? new ProcessBuilder("where", c) : new ProcessBuilder("sh", "-c", "command -v " + c))
                        .redirectErrorStream(true).start();
                p.getInputStream().readAllBytes();
                boolean ok = p.waitFor(10, TimeUnit.SECONDS) && p.exitValue() == 0;
                if (!ok) log.warn("Comando '{}' não encontrado no PATH", c);
                return ok;
            } catch (IOException | InterruptedException e) {
                return false;
            }
        });
    }

    private static String label(String provider) {
        return switch (provider) {
            case "OPENAI" -> "Codex";
            case "GEMINI" -> "Gemini CLI";
            case "CLAUDE" -> "Claude Code";
            default -> provider;
        };
    }

    private static List<String> split(String value) {
        if (value == null || value.isBlank()) return List.of();
        return Arrays.stream(value.split("\\|")).map(String::strip).filter(s -> !s.isEmpty()).toList();
    }
}
