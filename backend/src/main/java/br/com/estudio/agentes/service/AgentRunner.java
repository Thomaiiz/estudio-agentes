package br.com.estudio.agentes.service;

import br.com.estudio.agentes.model.Agent;
import br.com.estudio.agentes.model.Task;

/**
 * Executa de fato a tarefa de um agente. No MVP a implementação é simulada;
 * para ligar um LLM de verdade basta criar outro bean que implemente esta interface.
 */
public interface AgentRunner {

    interface ProgressListener {
        /** @param progress 0..100 ; @param message texto curto mostrado no balão do agente */
        void onProgress(int progress, String message);
    }

    String run(Agent agent, Task task, ProgressListener listener) throws Exception;
}
