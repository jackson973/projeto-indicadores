// Executa tarefas de sincronização em processos filhos.
// Syncs grandes (Sisplan 200k+ linhas, UpSeller com Puppeteer) elevavam o RSS
// da API além do limite do PM2 — o V8 não devolve heap ao SO. Num worker, a
// memória é devolvida integralmente quando o processo termina.
const path = require('path');
const { fork } = require('child_process');

// Trava por tarefa: uma execução por vez (ciclo agendado + botão manual).
const running = new Set();

// Tempo máximo de vida de um worker — evita que uma conexão travada no
// Firebird/UpSeller bloqueie a tarefa para sempre.
const WORKER_TIMEOUT_MS = 15 * 60 * 1000;

function runInWorker(task) {
  if (running.has(task)) {
    console.log(`[Sync Worker] Tarefa "${task}" já em andamento — ignorando nova execução.`);
    return Promise.resolve({ success: false, message: `Tarefa "${task}" já em andamento.` });
  }
  running.add(task);

  return new Promise((resolve) => {
    const worker = fork(path.join(__dirname, 'syncWorker.js'), [task]);
    let result = null;

    const timeout = setTimeout(() => {
      console.error(`[Sync Worker] Tarefa "${task}" excedeu ${WORKER_TIMEOUT_MS / 60000} min — matando worker.`);
      worker.kill('SIGKILL');
    }, WORKER_TIMEOUT_MS);

    worker.on('message', (msg) => { result = msg; });
    worker.on('error', (err) => {
      console.error(`[Sync Worker] Erro na tarefa "${task}":`, err.message);
      clearTimeout(timeout);
      running.delete(task);
      resolve({ success: false, message: err.message });
    });
    worker.on('exit', (code) => {
      clearTimeout(timeout);
      running.delete(task);
      resolve(result || { success: false, message: `Worker "${task}" terminou sem resultado (código ${code}).` });
    });
  });
}

module.exports = { runInWorker };
