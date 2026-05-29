/**
 * PM2 process yapılandırması (production).
 *
 * Kullanım:
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 reload ecosystem.config.cjs --env production   # sıfır-kesinti deploy
 *   pm2 logs adigehost-api
 *
 * Not: Zamanlayıcı (cron) yalnızca NODE_APP_INSTANCE=0 instance'ında çalışır
 * (bkz. backend/src/jobs/scheduler.ts).
 */
module.exports = {
  apps: [
    {
      name: 'adigehost-api',
      cwd: './backend',
      script: 'dist/index.js',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: './backend/logs/pm2-error.log',
      out_file: './backend/logs/pm2-out.log',
      merge_logs: true,
      time: true,
      kill_timeout: 10000,
      wait_ready: false,
    },
  ],
};
