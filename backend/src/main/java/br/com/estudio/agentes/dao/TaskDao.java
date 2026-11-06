package br.com.estudio.agentes.dao;

import br.com.estudio.agentes.model.Task;

import java.util.List;
import java.util.Optional;

/** Contrato de acesso a dados das tarefas (padrão DAO). */
public interface TaskDao {
    Task insert(Task task);
    void update(Task task);
    Optional<Task> findById(Long id);
    List<Task> findRecent(int limit);
    List<Task> findByAgent(Long agentId, int limit);
}
