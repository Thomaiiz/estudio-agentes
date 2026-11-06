package br.com.estudio.agentes.dao;

import br.com.estudio.agentes.model.Agent;
import br.com.estudio.agentes.model.AgentStatus;

import java.util.List;
import java.util.Optional;

/** Contrato de acesso a dados dos agentes (padrão DAO). */
public interface AgentDao {
    List<Agent> findAll();
    Optional<Agent> findById(Long id);
    Agent insert(Agent agent);
    void update(Agent agent);
    void updateStatus(Long id, AgentStatus status);
    void registerCompletion(Long id, long durationMs);
    boolean delete(Long id);
    int nextDeskIndex();
}
