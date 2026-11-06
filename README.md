# Sócios Acrílicos (MVP)

Painel onde cada agente de IA tem uma mesa num escritório 3D. Quando um agente recebe uma tarefa,
o backend publica eventos por WebSocket e o escritório reage em tempo real.

| Camada | Stack |
|---|---|
| Frontend | Angular 20 (standalone, signals, zoneless) + Three.js |
| Backend | Java 21 + Spring Boot 3.5 (MVC + DAO com JdbcTemplate, H2 em memória) |
| Tempo real | WebSocket puro em `/ws/agents` (JSON) |

## Como rodar

```bash
# 1) backend (porta 8080)
cd backend
mvn spring-boot:run

# 2) frontend (porta 4200, com proxy para /api e /ws)
cd frontend
npm install
npm start
```

Abra http://localhost:4200, clique numa mesa (ou num avatar da barra "Time") e envie uma tarefa.

## Ligar os agentes às suas assinaturas (gerar arquivos de verdade)

Por padrão (`estudio.runner.mode=cli`) cada agente chama a ferramenta oficial do provedor dele,
usando o **seu login** (o estúdio não guarda senha nem chave):

| Provedor do agente | Ferramenta | Instalar e fazer login (uma vez) |
|---|---|---|
| OPENAI | Codex CLI (ChatGPT Plus) | `npm i -g @openai/codex` → `codex` → "Sign in with ChatGPT" |
| GEMINI | Gemini CLI (conta Google) | `npm i -g @google/gemini-cli` → `gemini` → login com Google |
| CLAUDE | Claude Code (opcional) | se não estiver instalado, esses agentes usam o Codex (`estudio.runner.fallback-provider`) |

Cada pedido ganha uma pasta em `~/estudio-projetos/<nome-do-pedido>-<id>`; o caminho aparece no painel do
agente (clique para copiar). Tudo do time cai na mesma pasta: `frontend/`, `backend/`, `docs/`, `design/`,
`midia/`, `testes/`, além de `PLANO.md` e `README.md` escritos pelo Atlas.

Quando um agente termina, o painel dele mostra **"Ver o que ele fez"**: abre a tela da entrega com os arquivos
(marcados como "novo" os que ele criou/alterou), prévia do site (`index.html`) e do código, e o botão **Abrir site**.
Os arquivos são servidos por `GET /api/tasks/{id}/files` e `GET /api/tasks/{id}/raw/<caminho>` (somente dentro da
pasta do projeto, e o HTML roda isolado em sandbox).

Fluxo do Atlas (orquestrador): **1)** escreve o `PLANO.md` → **2)** os agentes de construção trabalham em
paralelo → **3)** revisão (Crivo) e testes (Farol) → **4)** Atlas integra e escreve o `README.md`.

Para voltar só à animação: `estudio.runner.mode=simulado` em `backend/src/main/resources/application.properties`.
Os comandos de cada ferramenta também podem ser ajustados ali (`estudio.cli.*`).

> Os limites de uso são os da sua assinatura. Os campos "Modelo" dos agentes são só rótulos: cada ferramenta
> usa o modelo padrão da sua conta.

## Feedback visual no escritório

| Estado do agente | O que acontece na cena |
|---|---|
| `RECEBENDO` | Balão "!" com efeito pop, personagem pula, tapete da mesa pisca |
| `PENSANDO` | Balão "..." animado, personagem balança, antenas pulsam |
| `TRABALHANDO` | Balão com anel de progresso (%), monitor com "código" rolando + barra, personagem digitando |
| `CONCLUIDO` | Balão ✓, confete, giro de comemoração; volta a `DISPONIVEL` após ~2,5 s |
| `ERRO` | Balão ✕, tremida, tapete vermelho |

Tarefas para o mesmo agente entram numa fila (uma por vez); agentes diferentes trabalham em paralelo.
O quadro na parede mostra quantos agentes estão trabalhando.

## Time e equipes fixas

| Agente | Papel | Equipe fixa |
|---|---|---|
| Atlas | Orquestra, divide e integra | — |
| Nova | Front-end, UX/UI e design | Forja (dev) |
| Forja | Back-end, infraestrutura e banco | Nova (dev) |
| Lince | Pesquisa e documentação | — |
| Crivo | Revisão de código | — |
| Prisma | Direção de arte e criativos | Ritmo e Aurora (mídia) |
| Ritmo | Vídeo e animação | Prisma e Aurora (mídia) |
| Aurora | Imagens e ilustração | Prisma e Ritmo (mídia) |
| Farol | Testes e qualidade | — |

**Atlas é o orquestrador** (opção "Orquestrador" no editor): quando recebe uma tarefa, ele divide o pedido
e cada agente do time recebe a sua parte ("<função>: <tarefa>"). O progresso do Atlas acompanha as entregas
(ex.: 5/8) e ele só conclui depois de integrar tudo.

Cada agente pode ter até 3 colegas fixos (`teamIds`). Quando ele recebe uma tarefa, cada colega recebe
automaticamente a sua parte ("<tarefa> (parte de <função>, com <agente>)") e todos reagem juntos no escritório.
A equipe é configurada na tela **Editar agente**.

## Arquitetura do backend

```
controller/   AgentController, TaskController, ApiExceptionHandler   (camada MVC / REST)
service/      AgentService, TaskService, StatsService, AgentRunner    (regras de negócio)
dao/          AgentDao, TaskDao + JdbcAgentDao, JdbcTaskDao            (acesso a dados, só aqui tem SQL)
model/        Agent, Task, AgentStatus, TaskStatus
websocket/    AgentWebSocketHandler, AgentEventBroadcaster
config/       WebSocketConfig, WebConfig (CORS)
```

`AgentRunner` é o ponto de extensão: `CliAgentRunner` chama Codex/Gemini/Claude Code pela linha de comando
(prompt pelo stdin, saída vira o progresso e o resumo); `SimulatedAgentRunner` só simula as etapas
(usado nos testes e com `estudio.runner.mode=simulado`).

### REST

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/agents` | Lista agentes |
| GET | `/api/agents/{id}` | Um agente |
| POST | `/api/agents` | Cria agente (ganha a próxima mesa livre) |
| PUT | `/api/agents/{id}` | Atualiza aparência/config |
| DELETE | `/api/agents/{id}` | Remove |
| POST | `/api/agents/{id}/tasks` | Atribui tarefa `{title, description}` → 202 |
| GET | `/api/agents/{id}/tasks` | Tarefas do agente |
| GET | `/api/tasks?limit=30` | Últimas tarefas |
| GET | `/api/stats` | Totais e uso por provedor |

### WebSocket `/ws/agents`

Servidor → cliente (`AgentEvent`):

```json
{ "type": "TASK_PROGRESS", "agentId": 3, "agentStatus": "TRABALHANDO",
  "task": { "id": 7, "title": "...", "progress": 50, "status": "EM_ANDAMENTO" },
  "message": "Executando", "timestamp": "2026-11-05T19:20:04Z" }
```

Tipos: `AGENT_CREATED`, `AGENT_UPDATED`, `AGENT_DELETED`, `TASK_RECEIVED`, `TASK_STARTED`,
`TASK_PROGRESS`, `TASK_COMPLETED`, `TASK_FAILED`.

Cliente → servidor (alternativa ao POST):

```json
{ "action": "ASSIGN_TASK", "agentId": 3, "title": "Revisar PR", "description": "opcional" }
```

## Frontend

```
core/         models, ApiService (REST), RealtimeService (WebSocket + reconexão), AgentStore (signals)
three/        OfficeScene (escritório, animações, clique), character-factory (corpos/olhos/antenas),
              canvas-textures (etiquetas, balões, telas), CharacterPreview, CharacterSnapshotService
pages/        office (3D + painel de tarefa + feed), team (cards), creator (novo/editar agente),
              data (métricas), settings (stub: contas/voz/skills)
```

## Testes

`cd backend && mvn test` sobe a aplicação numa porta aleatória, conecta um cliente WebSocket e
verifica a sequência `TASK_RECEIVED → TASK_STARTED → TASK_PROGRESS → TASK_COMPLETED`
(por REST e pelo próprio WebSocket), além da validação de criação de agentes.

## Próximos passos sugeridos

- `AgentRunner` reais por provedor (Claude, OpenAI, Gemini) com streaming de progresso.
- Trocar H2 por PostgreSQL (só os DAOs mudam) e autenticação no painel/WebSocket.
- Equipes fixas (duplas/trios), voz por agente e limites de uso por assinatura (telas já esboçadas).
