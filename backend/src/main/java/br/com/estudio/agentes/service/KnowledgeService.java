package br.com.estudio.agentes.service;

import br.com.estudio.agentes.dao.AgentDao;
import br.com.estudio.agentes.dto.Knowledge;
import br.com.estudio.agentes.dto.TaskRequest;
import br.com.estudio.agentes.model.Agent;
import br.com.estudio.agentes.model.Task;
import br.com.estudio.agentes.model.TaskStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

/**
 * "O que o time aprendeu": textos (anotações, resumos de vídeos) que entram no pedido de cada agente.
 * Fica em arquivos .md numa pasta fora do banco, então sobrevive a reinícios do backend.
 */
@Service
public class KnowledgeService {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeService.class);
    /** Limite do que vai junto no pedido de cada agente, para não estourar o contexto da IA. */
    static final int PROMPT_BUDGET = 16_000;
    private static final int MAX_CONTENT = 60_000;

    private final Path dir;
    private final Path workspaceRoot;
    private final List<String> ytDlp;
    private final AgentDao agentDao;
    private final TaskService taskService;

    public KnowledgeService(@Value("${estudio.conhecimento.dir}") String dir,
                            @Value("${estudio.runner.workspace}") String workspaceRoot,
                            @Value("${estudio.ytdlp:yt-dlp}") String ytDlp,
                            AgentDao agentDao, @Lazy TaskService taskService) {
        this.dir = Path.of(dir).toAbsolutePath().normalize();
        this.workspaceRoot = Path.of(workspaceRoot).toAbsolutePath().normalize();
        this.ytDlp = Arrays.stream(ytDlp.split("\\|")).map(String::strip).filter(s -> !s.isEmpty()).toList();
        this.agentDao = agentDao;
        this.taskService = taskService;
    }

    // ---------- leitura ----------

    public List<Knowledge> list() {
        if (!Files.isDirectory(dir)) return List.of();
        try (Stream<Path> files = Files.list(dir)) {
            return files.filter(p -> p.getFileName().toString().endsWith(".md"))
                    .map(this::read).flatMap(Optional::stream)
                    .sorted(Comparator.comparing(Knowledge::createdAt).reversed())
                    .toList();
        } catch (IOException e) {
            log.warn("Não consegui ler {}: {}", dir, e.getMessage());
            return List.of();
        }
    }

    /** Texto que vai no pedido do agente: o que vale para ele, do mais novo ao mais antigo, até o limite. */
    public String forPrompt(Long agentId) {
        StringBuilder sb = new StringBuilder();
        for (Knowledge k : list()) {
            if (!k.agentIds().isEmpty() && (agentId == null || !k.agentIds().contains(agentId))) continue;
            String block = "### " + k.title() + (k.source().isBlank() ? "" : " (fonte: " + k.source() + ")")
                    + "\n" + k.content().strip() + "\n\n";
            if (sb.length() + block.length() > PROMPT_BUDGET) {
                int room = PROMPT_BUDGET - sb.length();
                if (room > 400) sb.append(block, 0, room).append("\n[...]\n");
                break;
            }
            sb.append(block);
        }
        return sb.toString().strip();
    }

    // ---------- escrita ----------

    public Knowledge create(String title, String content, String source, List<Long> agentIds) {
        if (title == null || title.isBlank()) throw new IllegalArgumentException("Dê um título ao conhecimento");
        if (content == null || content.isBlank()) throw new IllegalArgumentException("O conteúdo está vazio");
        String body = content.strip();
        if (body.length() > MAX_CONTENT) body = body.substring(0, MAX_CONTENT);
        List<Long> agents = validAgents(agentIds);
        Instant now = Instant.now();
        String id = now.toEpochMilli() + "-" + TaskService.slug(title);
        Knowledge k = new Knowledge(id, title.strip(), source == null ? "" : source.strip(), agents, now, body);
        try {
            Files.createDirectories(dir);
            Files.writeString(dir.resolve(id + ".md"), serialize(k), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Não consegui salvar em " + dir + ": " + e.getMessage(), e);
        }
        return k;
    }

    public void delete(String id) {
        Path file = fileOf(id);
        try {
            if (!Files.deleteIfExists(file)) throw new NotFoundException("Conhecimento não encontrado: " + id);
        } catch (IOException e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
    }

    // ---------- aprender com vídeo ----------

    public record VideoStudy(long taskId, long agentId, String agentName, String videoTitle) {}

    /**
     * Baixa a legenda do vídeo com o yt-dlp (no computador onde o backend roda), salva a transcrição
     * numa pasta e manda o agente de pesquisa estudar. Quando ele termina, o APRENDIZADO.md vira conhecimento do time.
     */
    public VideoStudy learnFromVideo(String url, List<Long> agentIds) {
        if (url == null || !url.strip().matches("(?i)https?://\\S+")) {
            throw new IllegalArgumentException("Cole o link completo do vídeo (começando com https://)");
        }
        url = url.strip();
        List<Long> agents = validAgents(agentIds);
        Agent student = pickStudent();

        Path work = workspaceRoot.resolve("aprender-video-" + System.currentTimeMillis());
        Transcript t = fetchTranscript(url, work);
        String videoTitle = t.title().isBlank() ? url : t.title();

        String finalUrl = url;
        Task task = taskService.assignInWorkspace(student.getId(), new TaskRequest(
                cut("Estudar vídeo: " + videoTitle), """
                Na pasta atual está transcricao.txt, a transcrição do vídeo "%s" (%s).
                Leia a transcrição inteira e escreva o arquivo APRENDIZADO.md, em português, com o que o time
                de agentes deve aprender e aplicar daqui para frente:
                1. Resumo do vídeo em até 3 linhas.
                2. As lições e técnicas, em tópicos curtos e práticos.
                3. Passo a passo, quando o vídeo ensinar um processo.
                4. Ferramentas, sites ou comandos citados.
                5. Regras no formato "Quando for fazer X, faça Y", para os agentes seguirem.
                Use só o que está na transcrição; não invente. Máximo de 1500 palavras.
                Não crie outros arquivos.""".formatted(videoTitle, finalUrl)),
                work, done -> saveStudy(done, work, videoTitle, finalUrl, agents, t.text()));
        return new VideoStudy(task.getId(), student.getId(), student.getName(), videoTitle);
    }

    private void saveStudy(Task done, Path work, String title, String url, List<Long> agents, String transcript) {
        if (done.getStatus() != TaskStatus.CONCLUIDA) {
            log.info("Estudo do vídeo {} não terminou ({}): nada salvo", url, done.getStatus());
            return;
        }
        String content;
        try {
            Path notes = work.resolve("APRENDIZADO.md");
            content = Files.isRegularFile(notes) ? Files.readString(notes, StandardCharsets.UTF_8) : "";
        } catch (IOException e) {
            content = "";
        }
        if (content.isBlank()) { // o agente não escreveu o arquivo: guarda o começo da transcrição
            content = "Transcrição (resumo não gerado):\n" + transcript.substring(0, Math.min(transcript.length(), 8_000));
        }
        create("Vídeo: " + title, content, url, agents);
    }

    record Transcript(String title, String text) {}

    Transcript fetchTranscript(String url, Path work) {
        if (ytDlp.isEmpty()) throw new IllegalStateException("Comando do yt-dlp não configurado (estudio.ytdlp)");
        List<String> cmd = new ArrayList<>(ytDlp);
        cmd.addAll(List.of("--skip-download", "--no-simulate", "--no-playlist", "--write-subs", "--write-auto-subs",
                "--sub-langs", "pt.*,en.*", "--sub-format", "vtt/best", "--print", "title",
                "-o", "video.%(ext)s", url));
        String output;
        try {
            Files.createDirectories(work);
            Process p = new ProcessBuilder(cmd).directory(work.toFile()).redirectErrorStream(true).start();
            p.getOutputStream().close();
            output = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            if (!p.waitFor(3, TimeUnit.MINUTES)) {
                p.destroyForcibly();
                throw new IllegalStateException("O yt-dlp demorou demais para baixar a legenda");
            }
        } catch (IOException e) {
            throw new IllegalStateException("""
                    Não encontrei o yt-dlp, que baixa a legenda do vídeo. Instale no terminal:
                    sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp""");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrompido");
        }

        Path vtt = pickSubtitle(work);
        if (vtt == null) {
            String tail = output.length() > 300 ? output.substring(output.length() - 300) : output;
            throw new IllegalStateException("Esse vídeo não tem legenda (nem automática) em português ou inglês. "
                    + "Cole a transcrição na aba \"Colar texto\". Saída do yt-dlp: " + tail.strip());
        }
        String text;
        try {
            text = vttToText(Files.readString(vtt, StandardCharsets.UTF_8));
            Files.writeString(work.resolve("transcricao.txt"), text, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Não consegui ler a legenda: " + e.getMessage(), e);
        }
        if (text.isBlank()) throw new IllegalStateException("A legenda do vídeo veio vazia");
        String title = output.lines().map(String::strip)
                .filter(l -> !l.isEmpty() && !l.startsWith("[") && !l.toLowerCase(Locale.ROOT).startsWith("warning"))
                .findFirst().orElse("");
        return new Transcript(title, text);
    }

    /** Prefere legenda em português (manual antes da automática), depois inglês. */
    private static Path pickSubtitle(Path work) {
        try (Stream<Path> files = Files.list(work)) {
            List<Path> subs = files.filter(p -> p.getFileName().toString().endsWith(".vtt")).sorted().toList();
            for (String lang : List.of("video.pt-BR.", "video.pt.", "video.pt", "video.en.", "video.en")) {
                for (Path p : subs) if (p.getFileName().toString().startsWith(lang)) return p;
            }
            return subs.isEmpty() ? null : subs.get(0);
        } catch (IOException e) {
            return null;
        }
    }

    /** Converte WebVTT em texto corrido, tirando tempos, tags e as repetições das legendas automáticas. */
    static String vttToText(String vtt) {
        Set<String> seen = new LinkedHashSet<>();
        StringBuilder out = new StringBuilder();
        String last = "";
        int lines = 0;
        for (String raw : vtt.split("\\R")) {
            String line = raw.strip();
            if (line.isEmpty() || line.equals("WEBVTT") || line.contains("-->") || line.matches("\\d+")
                    || line.startsWith("Kind:") || line.startsWith("Language:") || line.startsWith("NOTE")
                    || line.startsWith("STYLE") || line.startsWith("Style:")) continue;
            line = line.replaceAll("<[^>]+>", "").replace("&nbsp;", " ").replace("&amp;", "&")
                    .replace("&gt;", ">").replace("&lt;", "<").replaceAll("\\s+", " ").strip();
            if (line.isEmpty() || line.equals(last) || seen.contains(line)) continue;
            seen.add(line);
            last = line;
            if (lines > 0) out.append(lines % 10 == 0 ? "\n" : " "); // um parágrafo a cada 10 falas
            out.append(line);
            lines++;
        }
        return out.toString();
    }

    // ---------- apoio ----------

    private Agent pickStudent() {
        List<Agent> all = agentDao.findAll();
        return all.stream().filter(a -> a.getRole() != null && a.getRole().toLowerCase(Locale.ROOT).contains("pesquis")).findFirst()
                .or(() -> all.stream().filter(a -> !a.isOrchestrator()).findFirst())
                .or(() -> all.stream().findFirst())
                .orElseThrow(() -> new IllegalArgumentException("Crie um agente antes"));
    }

    private List<Long> validAgents(List<Long> ids) {
        if (ids == null) return List.of();
        return ids.stream().filter(Objects::nonNull).distinct()
                .filter(id -> agentDao.findById(id).isPresent()).toList();
    }

    private Path fileOf(String id) {
        if (id == null || !id.matches("[0-9]+-[a-z0-9-]+")) throw new NotFoundException("Conhecimento não encontrado: " + id);
        return dir.resolve(id + ".md");
    }

    private static String cut(String s) {
        return s.length() > 150 ? s.substring(0, 147) + "..." : s;
    }

    // formato do arquivo: cabeçalho simples entre "---" e o conteúdo em Markdown
    private static String serialize(Knowledge k) {
        return "---\ntitulo: " + k.title().replace("\n", " ")
                + "\nfonte: " + k.source().replace("\n", " ")
                + "\nagentes: " + String.join(",", k.agentIds().stream().map(String::valueOf).toList())
                + "\ncriado: " + k.createdAt()
                + "\n---\n" + k.content() + "\n";
    }

    private Optional<Knowledge> read(Path file) {
        try {
            String raw = Files.readString(file, StandardCharsets.UTF_8);
            String id = file.getFileName().toString().replaceFirst("\\.md$", "");
            String title = id, source = "";
            List<Long> agents = List.of();
            Instant created = Files.getLastModifiedTime(file).toInstant();
            String content = raw;
            if (raw.startsWith("---\n")) {
                int end = raw.indexOf("\n---\n", 4);
                if (end > 0) {
                    for (String line : raw.substring(4, end).split("\n")) {
                        int c = line.indexOf(':');
                        if (c < 0) continue;
                        String key = line.substring(0, c).strip(), val = line.substring(c + 1).strip();
                        switch (key) {
                            case "titulo" -> title = val;
                            case "fonte" -> source = val;
                            case "agentes" -> agents = val.isEmpty() ? List.of() : Arrays.stream(val.split(","))
                                    .map(String::strip).filter(v -> v.matches("\\d+")).map(Long::valueOf).toList();
                            case "criado" -> { try { created = Instant.parse(val); } catch (Exception ignored) { } }
                            default -> { }
                        }
                    }
                    content = raw.substring(end + 5);
                }
            }
            return Optional.of(new Knowledge(id, title, source, agents, created, content.strip()));
        } catch (IOException e) {
            return Optional.empty();
        }
    }
}
