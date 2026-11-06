package br.com.estudio.agentes;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"estudio.simulacao.passo-ms=20", "estudio.runner.mode=simulado",
                "estudio.runner.workspace=target/test-projetos"})
class TaskFlowIntegrationTest {

    @LocalServerPort int port;
    @Autowired TestRestTemplate rest;
    @Autowired ObjectMapper mapper;

    @Test
    void tarefaEnviadaPorRestGeraEventosEmTempoReal() throws Exception {
        BlockingQueue<JsonNode> events = new LinkedBlockingQueue<>();
        WebSocketSession ws = connect(events);

        var resp = rest.postForEntity("/api/agents/1/tasks", Map.of("title", "Criar landing page"), Map.class);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);

        List<String> types = collectUntil(events, "TASK_COMPLETED");
        assertThat(types).containsSubsequence("TASK_RECEIVED", "TASK_STARTED", "TASK_PROGRESS", "TASK_COMPLETED");
        assertThat(collectUntil(events, "AGENT_UPDATED")).contains("AGENT_UPDATED"); // volta a ficar disponível
        ws.close();
    }

    @Test
    void tarefaEnviadaPeloWebSocketTambemFunciona() throws Exception {
        BlockingQueue<JsonNode> events = new LinkedBlockingQueue<>();
        WebSocketSession ws = connect(events);
        ws.sendMessage(new TextMessage("{\"action\":\"ASSIGN_TASK\",\"agentId\":2,\"title\":\"Revisar PR\"}"));

        List<String> types = collectUntil(events, "TASK_COMPLETED");
        assertThat(types).contains("ACK", "TASK_RECEIVED", "TASK_COMPLETED");
        ws.close();
    }

    @Test
    void equipeFixaEntraJuntoQuandoUmEEscalado() throws Exception {
        BlockingQueue<JsonNode> events = new LinkedBlockingQueue<>();
        WebSocketSession ws = connect(events);
        // Prisma (6) tem equipe com Ritmo (7) e Aurora (9)
        rest.postForEntity("/api/agents/6/tasks", Map.of("title", "Campanha de lançamento"), Map.class);
        java.util.Set<Long> received = new java.util.HashSet<>();
        long deadline = System.currentTimeMillis() + 5_000;
        while (received.size() < 3 && System.currentTimeMillis() < deadline) {
            JsonNode n = events.poll(500, TimeUnit.MILLISECONDS);
            if (n != null && "TASK_RECEIVED".equals(n.path("type").asText())) received.add(n.path("agentId").asLong());
        }
        assertThat(received).containsExactlyInAnyOrder(6L, 7L, 9L);
        ws.close();
    }

    @Test
    void botaoPararEncerraATarefaDoAgenteEAsPartesDelegadas() throws Exception {
        var resp = rest.postForEntity("/api/agents/1/tasks", Map.of("title", "Projeto para parar"), Map.class);
        long rootId = ((Number) resp.getBody().get("id")).longValue();
        Thread.sleep(400); // o Chefe Atlas já planejou e delegou

        var stop = rest.postForEntity("/api/agents/1/stop", null, Map.class);
        assertThat(stop.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(((Number) stop.getBody().get("paradas")).intValue()).isGreaterThanOrEqualTo(1);

        JsonNode root = null;
        long deadline = System.currentTimeMillis() + 5_000;
        while (System.currentTimeMillis() < deadline) {
            JsonNode tasks = mapper.readTree(rest.getForObject("/api/tasks?limit=100", String.class));
            root = null;
            boolean childActive = false;
            for (JsonNode t : tasks) {
                if (t.path("id").asLong() == rootId) root = t;
                if (t.path("parentId").asLong() == rootId
                        && List.of("NA_FILA", "EM_ANDAMENTO").contains(t.path("status").asText())) childActive = true;
            }
            if (root != null && "FALHOU".equals(root.path("status").asText()) && !childActive) break;
            Thread.sleep(100);
        }
        assertThat(root).isNotNull();
        assertThat(root.path("status").asText()).isEqualTo("FALHOU");
        assertThat(root.path("result").asText()).isEqualTo("Parada pelo usuário");
    }

    @Test
    void orquestradorDivideATarefaComOTimeEIntegraNoFim() throws Exception {
        BlockingQueue<JsonNode> events = new LinkedBlockingQueue<>();
        WebSocketSession ws = connect(events);
        rest.postForEntity("/api/agents/1/tasks", Map.of("title", "Site de e-commerce"), Map.class);
        java.util.Set<Long> received = new java.util.HashSet<>();
        boolean atlasDone = false;
        long deadline = System.currentTimeMillis() + 20_000;
        while (!atlasDone && System.currentTimeMillis() < deadline) {
            JsonNode n = events.poll(500, TimeUnit.MILLISECONDS);
            if (n == null) continue;
            String type = n.path("type").asText();
            if ("TASK_RECEIVED".equals(type)) received.add(n.path("agentId").asLong());
            if ("TASK_COMPLETED".equals(type) && n.path("agentId").asLong() == 1L) atlasDone = true;
        }
        assertThat(received).contains(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L, 9L);
        assertThat(atlasDone).isTrue();
        ws.close();
    }

    @Test
    void mostraOsArquivosDaEntregaSemSairDaPasta() throws Exception {
        var task = rest.postForEntity("/api/agents/5/tasks", Map.of("title", "Arquivos"), Map.class).getBody();
        long id = ((Number) task.get("id")).longValue();
        java.nio.file.Path dir = java.nio.file.Path.of((String) task.get("workspace"));
        java.nio.file.Files.createDirectories(dir.resolve("css"));
        java.nio.file.Files.writeString(dir.resolve("index.html"), "<h1>Oi</h1>");
        java.nio.file.Files.writeString(dir.resolve("css/style.css"), "h1{color:red}");

        var files = rest.getForEntity("/api/tasks/" + id + "/files", Map.class);
        assertThat(files.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(files.getBody().get("files").toString()).contains("index.html", "css/style.css");

        var html = rest.getForEntity("/api/tasks/" + id + "/raw/index.html", String.class);
        assertThat(html.getBody()).isEqualTo("<h1>Oi</h1>");
        assertThat(html.getHeaders().getContentType().toString()).startsWith("text/html");
        assertThat(html.getHeaders().getFirst("Content-Security-Policy")).contains("sandbox");
        assertThat(rest.getForEntity("/api/tasks/" + id + "/raw/css/style.css", String.class).getBody()).contains("color");

        var escape = rest.getForEntity("/api/tasks/" + id + "/raw/..%2F..%2Fpom.xml", String.class);
        assertThat(escape.getStatusCode().is2xxSuccessful()).isFalse();
    }

    @Test
    void criaAgenteEValidaCampos() {
        var ok = rest.postForEntity("/api/agents",
                Map.of("name", "Teste", "body", "estrela", "eyes", "prompt", "color", "#112233"), Map.class);
        assertThat(ok.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(ok.getBody()).containsEntry("body", "ESTRELA");

        var bad = rest.postForEntity("/api/agents", Map.of("name", "X", "color", "azul"), Map.class);
        assertThat(bad.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        var bigTeam = rest.postForEntity("/api/agents",
                Map.of("name", "Y", "teamIds", java.util.List.of(1, 2, 3, 4)), Map.class);
        assertThat(bigTeam.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        var missing = rest.postForEntity("/api/agents/999/tasks", Map.of("title", "x"), Map.class);
        assertThat(missing.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    private WebSocketSession connect(BlockingQueue<JsonNode> sink) throws Exception {
        var headers = new WebSocketHttpHeaders();
        headers.add(HttpHeaders.ORIGIN, "http://localhost:4200");
        WebSocketSession session = new StandardWebSocketClient().execute(new TextWebSocketHandler() {
            @Override
            protected void handleTextMessage(WebSocketSession s, TextMessage m) throws Exception {
                sink.add(mapper.readTree(m.getPayload()));
            }
        }, headers, URI.create("ws://localhost:" + port + "/ws/agents")).get(5, TimeUnit.SECONDS);
        assertThat(sink.poll(5, TimeUnit.SECONDS).path("type").asText()).isEqualTo("CONNECTED");
        return session;
    }

    private static List<String> collectUntil(BlockingQueue<JsonNode> q, String last) throws InterruptedException {
        List<String> seen = new ArrayList<>();
        long deadline = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < deadline) {
            JsonNode n = q.poll(500, TimeUnit.MILLISECONDS);
            if (n == null) continue;
            seen.add(n.path("type").asText());
            if (last.equals(n.path("type").asText())) return seen;
        }
        return seen;
    }
}
