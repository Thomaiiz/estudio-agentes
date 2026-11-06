package br.com.estudio.agentes.service;

import br.com.estudio.agentes.dao.TaskDao;
import br.com.estudio.agentes.dto.ProjectFiles;
import br.com.estudio.agentes.dto.ProjectFiles.FileEntry;
import br.com.estudio.agentes.model.Task;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

/** Mostra o que cada agente produziu: lista e lê arquivos da pasta do projeto, sem sair dela. */
@Service
public class ProjectFilesService {

    private static final Set<String> IGNORED = Set.of("node_modules", ".git", "target", "dist", ".angular", "__pycache__", ".venv", "venv",
            ".pytest_cache", ".mypy_cache", ".ruff_cache", ".idea", ".vscode", ".DS_Store");
    private static final int MAX_FILES = 1000;

    private final TaskDao taskDao;
    private final Path workspaceRoot;

    public ProjectFilesService(TaskDao taskDao, @Value("${estudio.runner.workspace}") String workspaceRoot) {
        this.taskDao = taskDao;
        this.workspaceRoot = Path.of(workspaceRoot).toAbsolutePath().normalize();
    }

    public ProjectFiles list(Long taskId) throws IOException {
        Task task = task(taskId);
        Path dir = workspace(task);
        List<FileEntry> files = new ArrayList<>();
        if (Files.isDirectory(dir)) {
            Instant from = task.getStartedAt();
            Instant to = task.getFinishedAt() == null ? Instant.now() : task.getFinishedAt().plusSeconds(5);
            try (Stream<Path> walk = Files.walk(dir)) {
                walk.filter(Files::isRegularFile)
                        .filter(p -> { for (Path part : dir.relativize(p)) if (IGNORED.contains(part.toString())) return false; return true; })
                        .limit(MAX_FILES)
                        .forEach(p -> {
                            try {
                                Instant mod = Files.getLastModifiedTime(p).toInstant();
                                boolean changed = from != null && !mod.isBefore(from) && !mod.isAfter(to);
                                files.add(new FileEntry(dir.relativize(p).toString().replace('\\', '/'), Files.size(p), mod, changed));
                            } catch (IOException ignored) { /* arquivo sumiu no meio do caminho */ }
                        });
            }
        }
        // arquivos da raiz (PLANO.md, README.md...) primeiro, depois por pasta
        files.sort(Comparator.comparing((FileEntry f) -> f.path().contains("/")).thenComparing(FileEntry::path));
        return new ProjectFiles(task.getId(), task.getAgentId(), task.getTitle(), task.getStatus().name(),
                dir.toString(), task.getStartedAt(), task.getFinishedAt(), task.getResult(), files);
    }

    /** Resolve um arquivo da entrega, recusando qualquer caminho fora da pasta do projeto. */
    public Path file(Long taskId, String relative) {
        Path dir = workspace(task(taskId));
        Path target = dir.resolve(relative == null ? "" : relative).normalize();
        if (!target.startsWith(dir)) throw new IllegalArgumentException("Caminho fora da pasta do projeto");
        if (!Files.isRegularFile(target)) throw new NotFoundException("Arquivo não encontrado: " + relative);
        return target;
    }

    private Task task(Long id) {
        return taskDao.findById(id).orElseThrow(() -> new NotFoundException("Tarefa " + id + " não encontrada"));
    }

    private Path workspace(Task task) {
        if (task.getWorkspace() == null) throw new NotFoundException("Essa tarefa não tem pasta de projeto");
        Path dir = Path.of(task.getWorkspace()).toAbsolutePath().normalize();
        if (!dir.startsWith(workspaceRoot)) throw new IllegalArgumentException("Pasta fora da área de projetos");
        return dir;
    }
}
