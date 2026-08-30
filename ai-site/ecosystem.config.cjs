/**
 * PM2 process yapılandırması (ai.adigehost.tr backend, production).
 *
 * Kullanım:
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 reload ecosystem.config.cjs --env production   # sıfır-kesinti deploy
 *   pm2 logs ai-adigehost-api
 *
 * Not: Compute worker döngüleri (Ollama iş dağıtımı) yalnızca NODE_APP_INSTANCE=0
 * instance'ında çalışır (bkz. backend/src/index.ts, backend/src/jobs/computeWorker.ts).
 */
module.exports = {
  apps: [
    {
      name: 'ai-adigehost-api',
      cwd: './backend',
      script: 'dist/index.js',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '300M',
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
      // Gateway proxy'si (proxyGateway.ts JOB_WAIT_TIMEOUT_MS) devam eden bir
      // compute işini en fazla 120s bekler — kill_timeout bunun üzerinde olmalı,
      // yoksa PM2 istek doğal olarak bitmeden süreci SIGKILL ile öldürür.
      kill_timeout: 130000,
      // wait_ready:true + process.send('ready') (bkz. backend/src/index.ts) — PM2
      // rolling reload sırasında eski instance'ı ancak yenisi gerçekten app.listen()'i
      // tamamlayıp hazır sinyali gönderdikten sonra kapatır. Önceden wait_ready:false
      // idi; PM2 yeni instance'ı spawn eder etmez (henüz sequelize.authenticate()
      // bitmeden, port dinlemeye başlamadan) eskisine SIGINT gönderiyordu — bu da her
      // reload'da nginx'in her iki instance'a da ulaşamadığı kısa bir 502 penceresi
      // açıyordu (2026-08-30, 15:49:45-46 UTC'deki müşteri 502'leri buradan kaynaklandı).
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
