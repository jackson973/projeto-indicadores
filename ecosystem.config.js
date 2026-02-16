module.exports = {
  apps: [
    {
      name: 'api',
      cwd: './apps/server',
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Configurações de restart em caso de falha
      min_uptime: '10s',
      max_restarts: 10,
      // Configurações de cron para reinício automático (opcional)
      // cron_restart: '0 2 * * *', // Reiniciar às 2h da manhã todo dia
      // Variáveis de ambiente adicionais
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
