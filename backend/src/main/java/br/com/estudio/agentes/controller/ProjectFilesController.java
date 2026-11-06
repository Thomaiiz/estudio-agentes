package br.com.estudio.agentes.controller;

import br.com.estudio.agentes.dto.ProjectFiles;
import br.com.estudio.agentes.service.ProjectFilesService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

/** "Ver o que ele fez": arquivos gerados pelos agentes em cada tarefa. */
@RestController
@RequestMapping("/api/tasks/{id}")
public class ProjectFilesController {

    private final ProjectFilesService service;

    public ProjectFilesController(ProjectFilesService service) {
        this.service = service;
    }

    @GetMapping("/files")
    public ProjectFiles files(@PathVariable Long id) throws IOException {
        return service.list(id);
    }

    /**
     * Serve um arquivo da pasta (ex.: /api/tasks/7/raw/index.html). Caminhos relativos dentro do HTML
     * (style.css, js/app.js) funcionam porque o navegador resolve a partir desta URL.
     */
    @GetMapping("/raw/**")
    public ResponseEntity<Resource> raw(@PathVariable Long id, HttpServletRequest request) {
        String prefix = "/api/tasks/" + id + "/raw/";
        String uri = request.getRequestURI();
        int at = uri.indexOf(prefix);
        String relative = at < 0 ? "" : URLDecoder.decode(uri.substring(at + prefix.length()), StandardCharsets.UTF_8);
        if (relative.isEmpty()) relative = "index.html";
        Path file = service.file(id, relative);

        MediaType type = MediaTypeFactory.getMediaType(file.getFileName().toString()).orElse(MediaType.TEXT_PLAIN);
        if ("text".equals(type.getType()) || type.getSubtype().contains("javascript") || type.getSubtype().contains("json")) {
            type = new MediaType(type, StandardCharsets.UTF_8);
        }
        return ResponseEntity.ok()
                .contentType(type)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                // o conteúdo foi gerado por IA: roda isolado, sem acesso ao painel nem à API
                .header("Content-Security-Policy", "sandbox allow-scripts allow-forms allow-popups allow-modals")
                .header("X-Content-Type-Options", "nosniff")
                .body(new FileSystemResource(file));
    }
}
