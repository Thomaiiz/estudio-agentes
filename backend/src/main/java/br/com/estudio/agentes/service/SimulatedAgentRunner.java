package br.com.estudio.agentes.service;

import br.com.estudio.agentes.model.Agent;
import br.com.estudio.agentes.model.Task;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

/** Simula o trabalho de um agente em etapas, emitindo progresso (estudio.runner.mode=simulado). */
@Component
@ConditionalOnProperty(name = "estudio.runner.mode", havingValue = "simulado")
public class SimulatedAgentRunner implements AgentRunner {

    private static final List<String> ETAPAS = List.of(
            "Lendo o pedido", "Planejando", "Consultando o contexto",
            "Executando", "Revisando", "Finalizando");

    private final long passoMs;

    public SimulatedAgentRunner(@Value("${estudio.simulacao.passo-ms:700}") long passoMs) {
        this.passoMs = passoMs;
    }

    @Override
    public String run(Agent agent, Task task, ProgressListener listener) throws InterruptedException {
        int passos = ETAPAS.size();
        for (int i = 0; i < passos; i++) {
            long jitter = ThreadLocalRandom.current().nextLong(passoMs / 2 + 1);
            Thread.sleep(passoMs + jitter);
            int progresso = (int) Math.round((i + 1) * 100.0 / passos);
            listener.onProgress(progresso, ETAPAS.get(i));
        }
        return "%s concluiu \"%s\" usando %s.".formatted(agent.getName(), task.getTitle(), agent.getModel());
    }
}
