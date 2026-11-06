package br.com.estudio.agentes.controller;

import br.com.estudio.agentes.dto.TaskRequest;
import br.com.estudio.agentes.model.Agent;
import br.com.estudio.agentes.model.Task;
import br.com.estudio.agentes.service.AgentService;
import br.com.estudio.agentes.service.TaskService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/agents")
public class AgentController {

    private final AgentService agentService;
    private final TaskService taskService;

    public AgentController(AgentService agentService, TaskService taskService) {
        this.agentService = agentService;
        this.taskService = taskService;
    }

    @GetMapping
    public List<Agent> list() {
        return agentService.list();
    }

    @GetMapping("/{id}")
    public Agent get(@PathVariable Long id) {
        return agentService.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Agent create(@RequestBody Agent agent) {
        return agentService.create(agent);
    }

    @PutMapping("/{id}")
    public Agent update(@PathVariable Long id, @RequestBody Agent agent) {
        return agentService.update(id, agent);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        agentService.delete(id);
    }

    /** Atribui uma tarefa: o feedback visual chega a todos os painéis pelo WebSocket. */
    @PostMapping("/{id}/tasks")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Task assignTask(@PathVariable Long id, @Valid @RequestBody TaskRequest request) {
        return taskService.assign(id, request);
    }

    @GetMapping("/{id}/tasks")
    public List<Task> tasks(@PathVariable Long id, @RequestParam(defaultValue = "20") int limit) {
        return taskService.byAgent(id, limit);
    }
}
