#!/bin/bash

# ========================================
# Auto Deploy Watcher
# Verifica novos commits em origin/main a cada 20s
# e executa o deploy.sh quando encontrar.
# Executado como serviço systemd (ver scripts/install-auto-deploy.sh)
# ========================================

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BRANCH="${BRANCH:-main}"
INTERVAL="${INTERVAL:-20}"        # segundos entre verificações
RETRY_DELAY="${RETRY_DELAY:-300}" # espera após um deploy falhar
HEARTBEAT="${HEARTBEAT:-180}"     # loga "estou vivo" a cada N verificações (180 × 20s ≈ 1h); 0 desativa

log() {
    echo "[auto-deploy] $(date '+%Y-%m-%d %H:%M:%S') $1"
}

cd "$REPO_DIR" || { log "✗ Diretório não encontrado: $REPO_DIR"; exit 1; }

if [ ! -f "$REPO_DIR/deploy.sh" ]; then
    log "✗ deploy.sh não encontrado em $REPO_DIR"
    exit 1
fi

# Compara contra o último commit IMPLANTADO COM SUCESSO (não contra o HEAD):
# se o deploy falhar depois do git pull, o HEAD já avançou, mas o deploy
# precisa ser retentado mesmo assim.
LAST_DEPLOYED=$(git rev-parse HEAD)

log "Monitorando $REPO_DIR (origin/$BRANCH) a cada ${INTERVAL}s — versão atual ${LAST_DEPLOYED:0:7}"

CHECKS=0

# Watchdog: se o PM2 marcar a API como errored/stopped (ex.: "too many
# unstable restarts"), ela NÃO volta sozinha — o watcher ressuscita.
check_api_alive() {
    command -v pm2 >/dev/null 2>&1 || return 0
    local status
    status=$(pm2 jlist 2>/dev/null | node -e "
        let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
            try{const a=JSON.parse(d);const p=a.find(x=>x.name==='api');
                console.log(p?p.pm2_env.status:'missing');}
            catch(e){console.log('unknown');}
        });" 2>/dev/null)
    case "$status" in
        online|launching|unknown|'') return 0 ;;
        *)
            log "⚠ API está '$status' no PM2 — ressuscitando..."
            if (cd "$REPO_DIR" && pm2 startOrRestart ecosystem.config.js --only api >/dev/null 2>&1 && pm2 save >/dev/null 2>&1); then
                log "✅ API religada pelo watchdog"
            else
                log "✗ Watchdog não conseguiu religar a API (ver pm2 logs api)"
            fi
            ;;
    esac
}

while true; do
    check_api_alive

    if ! git fetch origin "$BRANCH" --quiet; then
        log "⚠ git fetch falhou (rede/GitHub fora?). Nova tentativa em ${INTERVAL}s"
        sleep "$INTERVAL"
        continue
    fi

    REMOTE=$(git rev-parse "origin/$BRANCH")

    if [ "$REMOTE" != "$LAST_DEPLOYED" ]; then
        log "Novo commit detectado: ${LAST_DEPLOYED:0:7} -> ${REMOTE:0:7}. Iniciando deploy..."
        if bash "$REPO_DIR/deploy.sh"; then
            LAST_DEPLOYED="$REMOTE"
            log "✅ Deploy concluído em ${REMOTE:0:7}"
        else
            log "✗ Deploy falhou. Nova tentativa em ${RETRY_DELAY}s (ou antes, se chegar commit novo)"
            sleep "$RETRY_DELAY"
            continue
        fi
    else
        CHECKS=$((CHECKS + 1))
        if [ "$HEARTBEAT" -gt 0 ] && [ $((CHECKS % HEARTBEAT)) -eq 0 ]; then
            log "Sem commits novos ($CHECKS verificações desde o início — versão atual ${LAST_DEPLOYED:0:7})"
        fi
    fi

    sleep "$INTERVAL"
done
