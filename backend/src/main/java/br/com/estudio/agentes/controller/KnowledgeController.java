package br.com.estudio.agentes.controller;

import br.com.estudio.agentes.dto.Knowledge;
import br.com.estudio.agentes.service.KnowledgeService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Tela "Conhecimento": o que o time aprendeu (textos colados e vídeos estudados). */
@RestController
@RequestMapping("/api/conhecimento")
public class KnowledgeController {

    private final KnowledgeService service;

    public KnowledgeController(KnowledgeService service) {
        this.service = service;
    }

    @GetMapping
    public List<Knowledge> list() {
        return service.list();
    }

    @PostMapping
    public ResponseEntity<Knowledge> create(@RequestBody Knowledge.CreateRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(req.title(), req.content(), req.source(), req.agentIds()));
    }

    /** Baixa a legenda e manda o agente de pesquisa estudar; o resultado entra na lista quando ele terminar. */
    @PostMapping("/video")
    public ResponseEntity<KnowledgeService.VideoStudy> video(@RequestBody Knowledge.VideoRequest req) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(service.learnFromVideo(req.url(), req.agentIds()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
