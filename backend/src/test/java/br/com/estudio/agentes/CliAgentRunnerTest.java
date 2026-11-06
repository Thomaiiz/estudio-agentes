package br.com.estudio.agentes;

import br.com.estudio.agentes.model.Agent;
import br.com.estudio.agentes.model.Task;
import br.com.estudio.agentes.service.CliAgentRunner;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CliAgentRunnerTest {

    @TempDir Path dir;

    private static final String FALHA = "sh|-c|cat >/dev/null; echo limite de uso atingido; exit 3";
    private static final String OK = "sh|-c|cat >/dev/null; echo arquivo criado";

    private Task task() {
        Task t = new Task();
        t.setId(1L);
        t.setTitle("Teste");
        t.setWorkspace(dir.toString());
        return t;
    }

    private Agent agent(String provider) {
        Agent a = new Agent();
        a.setName("Farol");
        a.setProvider(provider);
        return a;
    }

    @Test
    void quandoOProvedorFalhaTentaOutroInstalado() throws Exception {
        CliAgentRunner runner = new CliAgentRunner(OK, FALHA, "nao-instalado-xyz", "", "OPENAI", 1);
        List<String> msgs = new ArrayList<>();
        String out = runner.run(agent("GEMINI"), task(), (p, m) -> msgs.add(m));
        assertThat(out).contains("arquivo criado");
        assertThat(msgs).anyMatch(m -> m.contains("Gemini CLI falhou, tentando com Codex"));
    }

    @Test
    void quandoTodosFalhamMostraOMotivoDoPrimeiro() {
        CliAgentRunner runner = new CliAgentRunner(FALHA, FALHA, "nao-instalado-xyz", "", "OPENAI", 1);
        assertThatThrownBy(() -> runner.run(agent("GEMINI"), task(), (p, m) -> {}))
                .hasMessageContaining("Gemini CLI terminou com erro (3)")
                .hasMessageContaining("limite de uso atingido");
    }
}
