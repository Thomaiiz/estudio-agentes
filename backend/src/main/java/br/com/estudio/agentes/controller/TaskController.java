package br.com.estudio.agentes.controller;

import br.com.estudio.agentes.dto.StatsResponse;
import br.com.estudio.agentes.model.Task;
import br.com.estudio.agentes.service.StatsService;
import br.com.estudio.agentes.service.TaskService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class TaskController {

    private final TaskService taskService;
    private final StatsService statsService;

    public TaskController(TaskService taskService, StatsService statsService) {
        this.taskService = taskService;
        this.statsService = statsService;
    }

    @GetMapping("/tasks")
    public List<Task> recent(@RequestParam(defaultValue = "30") int limit) {
        return taskService.recent(limit);
    }

    /** Botão "Parar" do painel do agente. */
    @PostMapping("/agents/{id}/stop")
    public Map<String, Integer> stop(@PathVariable Long id) {
        return Map.of("paradas", taskService.stopAgent(id));
    }

    @GetMapping("/stats")
    public StatsResponse stats() {
        return statsService.compute();
    }
}
