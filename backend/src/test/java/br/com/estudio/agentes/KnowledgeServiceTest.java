package br.com.estudio.agentes;

import br.com.estudio.agentes.dao.AgentDao;
import br.com.estudio.agentes.model.Agent;
import br.com.estudio.agentes.service.KnowledgeService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.lang.reflect.Proxy;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class KnowledgeServiceTest {

    @TempDir Path dir;

    /** DAO de mentira: agentes 1 e 2 existem. */
    private final AgentDao agents = (AgentDao) Proxy.newProxyInstance(AgentDao.class.getClassLoader(),
            new Class<?>[]{AgentDao.class}, (p, m, args) -> switch (m.getName()) {
                case "findById" -> ((Long) args[0]) <= 2 ? Optional.of(new Agent()) : Optional.empty();
                case "findAll" -> List.of();
                default -> null;
            });

    @Test
    void cadaAgenteRecebeSoOQueValeParaEle() {
        KnowledgeService k = new KnowledgeService(dir.toString(), dir.resolve("w").toString(), "yt-dlp", agents, null);
        k.create("Para todos", "Regra geral", "", List.of());
        k.create("Só do 2", "Regra do front", "https://exemplo", List.of(2L, 99L));

        assertThat(k.forPrompt(1L)).contains("Regra geral").doesNotContain("Regra do front");
        assertThat(k.forPrompt(2L)).contains("Regra geral").contains("Regra do front").contains("fonte: https://exemplo");
        assertThat(k.list()).hasSize(2);
        assertThat(k.list().stream().filter(x -> x.title().equals("Só do 2")).findFirst().orElseThrow().agentIds())
                .containsExactly(2L); // agente 99 não existe
    }
}
