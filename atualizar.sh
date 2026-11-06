#!/usr/bin/env bash
# Sobe o backend e o frontend e fica de olho no GitHub.
# Quando chega mudança nova: baixa (git pull), reinicia o backend se ele mudou
# e reinstala/reinicia o frontend se as dependências mudaram.
# Uso:  ./atualizar.sh        (Ctrl+C para parar tudo)
set -u
cd "$(dirname "$0")"

INTERVALO=${INTERVALO:-30}
RAMO=${RAMO:-main}
mkdir -p logs

BACK_PID=""
FRONT_PID=""

log() { echo "[$(date +%H:%M:%S)] $*"; }

parar() { # $1 = pid do grupo
  [ -n "$1" ] || return 0
  kill -TERM -- "-$1" 2>/dev/null
  for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 -- "-$1" 2>/dev/null || return 0; sleep 1; done
  kill -KILL -- "-$1" 2>/dev/null
}

liberar_porta() { # mata o que sobrou de uma execução anterior
  command -v fuser >/dev/null && fuser -k "$1/tcp" >/dev/null 2>&1
}

subir_backend() {
  parar "$BACK_PID"; liberar_porta 8080
  log "Iniciando backend (log em logs/backend.log)"
  setsid bash -c 'cd backend && exec mvn -q spring-boot:run' >logs/backend.log 2>&1 &
  BACK_PID=$!
}

subir_frontend() {
  parar "$FRONT_PID"; liberar_porta 4200
  if [ ! -d frontend/node_modules ] || [ "${1:-}" = "instalar" ]; then
    log "Instalando dependências do frontend"
    (cd frontend && npm install --no-audit --no-fund >../logs/npm-install.log 2>&1) || log "npm install falhou, veja logs/npm-install.log"
  fi
  log "Iniciando frontend em http://localhost:4200 (log em logs/frontend.log)"
  setsid bash -c 'cd frontend && exec npm start' >logs/frontend.log 2>&1 &
  FRONT_PID=$!
}

encerrar() {
  echo; log "Parando tudo..."
  parar "$BACK_PID"; parar "$FRONT_PID"
  exit 0
}
trap encerrar INT TERM

subir_backend
subir_frontend
log "Tudo no ar. Verificando o GitHub a cada ${INTERVALO}s. Ctrl+C para parar."

while true; do
  sleep "$INTERVALO" & wait $!   # assim o Ctrl+C responde na hora
  git fetch -q origin "$RAMO" 2>/dev/null || { log "Sem conexão com o GitHub, tento de novo depois"; continue; }
  ANTES=$(git rev-parse HEAD)
  DEPOIS=$(git rev-parse "origin/$RAMO")
  [ "$ANTES" = "$DEPOIS" ] && continue

  if ! git pull -q --ff-only origin "$RAMO"; then
    log "Não consegui atualizar: há mudanças locais na pasta. Rode 'git status' para ver."
    continue
  fi
  log "Atualizado: $(git log -1 --format=%s)"
  MUDOU=$(git diff --name-only "$ANTES" "$DEPOIS")

  # o próprio script mudou: reinicia tudo com a versão nova
  if echo "$MUDOU" | grep -q '^atualizar.sh$'; then
    log "O atualizar.sh mudou, reiniciando com a versão nova"
    parar "$BACK_PID"; parar "$FRONT_PID"
    exec "$0"
  fi
  if echo "$MUDOU" | grep -q '^backend/'; then
    subir_backend
  fi
  if echo "$MUDOU" | grep -q '^frontend/package'; then
    subir_frontend instalar
  fi
  # outras mudanças do frontend o próprio 'npm start' recarrega sozinho
done
