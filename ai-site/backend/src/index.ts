import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { env } from "./config/env";
import { sequelize } from "./config/database";
import authRouter from "./routes/auth";
import resourcesRouter from "./routes/resources";
import reservationsRouter from "./routes/reservations";
import proxyOpenAIRouter from "./routes/proxyOpenAI";
import proxyComputeRouter from "./routes/proxyCompute";
import proxyGatewayRouter from "./routes/proxyGateway";
import adminCustomersRouter from "./routes/adminCustomers";
import adminJobsRouter from "./routes/adminJobs";
import adminReservationsRouter from "./routes/adminReservations";
import { zodErrorHandler } from "./middleware/zodError";
import { errorHandler } from "./middleware/errors";
import { startComputeWorkers } from "./jobs/computeWorker";

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(
  cors({
    origin: [`https://${env.cookieDomain}`, `http://${env.cookieDomain}`],
    credentials: true,
  }),
);

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/resources", resourcesRouter);
app.use("/api/reservations", reservationsRouter);
app.use("/api/proxy/openai", proxyOpenAIRouter);
app.use("/api/proxy/compute", proxyComputeRouter);
app.use("/api/proxy/gateway", proxyGatewayRouter);
app.use("/api/admin", adminCustomersRouter);
app.use("/api/admin", adminJobsRouter);
app.use("/api/admin/reservations", adminReservationsRouter);

app.use(zodErrorHandler);
app.use(errorHandler);

// PM2 cluster modunda her instance'a NODE_APP_INSTANCE=0,1,2... atanır.
// Compute worker döngüleri (Ollama'ya iş dağıtımı) sadece tek bir instance'ta
// çalışmalı — aksi halde aynı işi iki instance aynı anda işleyebilir.
const isPrimaryInstance = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === "0";

async function main() {
  await sequelize.authenticate();
  const server = app.listen(env.port, "127.0.0.1", () => {
    console.log(`ai-adigehost-api ${env.port} portunda dinliyor (instance ${process.env.NODE_APP_INSTANCE ?? "0"})`);
    // PM2'ye (wait_ready:true + ecosystem'deki listen_timeout ile) bu instance'ın
    // gerçekten bağlantı kabul ettiğini bildir. Bu sinyal olmadan PM2 rolling reload
    // sırasında eski instance'ı, yenisi henüz app.listen()'i tamamlamadan öldürebiliyor
    // (sequelize.authenticate() süresi kadar bir kesinti penceresi açılıyordu).
    process.send?.("ready");
  });
  if (isPrimaryInstance) await startComputeWorkers();

  // PM2 reload sırasında SIGINT gönderilir. Handler olmadan Node süreci anında
  // sonlandırır ve devam eden istekleri (ör. Ollama'dan yanıt bekleyen uzun
  // gateway istekleri) yarıda keser. server.close() yeni bağlantı kabul etmeyi
  // durdurur ama açık bağlantılar kendi işini bitirene kadar bekler.
  const shutdown = (signal: string) => {
    console.log(`${signal} alındı, devam eden istekler tamamlanınca kapanılacak...`);
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Başlatma hatası:", err);
  process.exit(1);
});
