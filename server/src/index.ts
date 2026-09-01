/**
 * index.ts
 * Servidor principal do Zapizapi
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

import wapiRoutes from "./routes/wapi.js";
import uploadRoutes from "./routes/upload.js";
import campaignRoutes from "./routes/campaigns.js";
import notificacaoRoutes from "./routes/notificacao.js";
import agendamentosRoutes from "./routes/agendamentos.js";
import { onStatusUpdate, recuperarCampanhasTravadas } from "./services/queue.js";
import { prisma } from "./db.js";
import { iniciarScheduler } from "./services/scheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Arquivos estáticos (uploads)
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// Rotas
app.use("/api/wapi", wapiRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/notificacao", notificacaoRoutes);
app.use("/api/agendamentos", agendamentosRoutes);

// Frontend (produção): serve o build do client e SPA fallback
const clientDist = path.join(__dirname, "..", "..", "client", "dist");
app.use(express.static(clientDist));
app.get(/^(?!\/(api|uploads|socket\.io)).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) res.status(404).send("Client não buildado. Rode 'npm run build:client'.");
  });
});

// WebSocket — atualização em tempo real
io.on("connection", (socket) => {
  console.log("Cliente conectado via WebSocket:", socket.id);

  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);
  });
});

// Registra callback de atualização de status para enviar via WebSocket
onStatusUpdate((campanhaId, contatoId, status, erro) => {
  io.emit("campaign-update", { campanhaId, contatoId, status, erro, timestamp: new Date().toISOString() });
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Inicia servidor
httpServer.listen(PORT, () => {
  console.log(`🚀 Zapizapi server rodando na porta ${PORT}`);
  console.log(`   http://localhost:${PORT}`);
  iniciarScheduler();
  // Recupera fila perdida após restart (campanhas em_andamento)
  setTimeout(() => {
    recuperarCampanhasTravadas()
      .then((n) => n && console.log(`[BOOT] ${n} campanha(s) travada(s) recuperada(s)`))
      .catch((e) => console.error("[BOOT] Falha ao recuperar fila:", e));
  }, 7000);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

// Trata erros não tratados para não crashar o servidor
process.on("unhandledRejection", (err) => {
  console.error("[UNHANDLED REJECTION]", err);
});

process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
});
