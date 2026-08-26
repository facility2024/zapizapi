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
import { onStatusUpdate } from "./services/queue.js";
import { prisma } from "./db.js";

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
