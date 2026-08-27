/**
 * wapi.ts
 * Rotas de conexão W-API (QR Code + status)
 */

import { Router } from "express";
import * as wapi from "../services/wapiClient.js";

const router = Router();

// GET /api/wapi/status — status da instância
router.get("/status", async (_req, res) => {
  const status = await wapi.checkStatus();
  res.json(status);
});

// GET /api/wapi/qrcode — obtém QR Code para pareamento
router.get("/qrcode", async (_req, res) => {
  try {
    const qr = await wapi.getQrCode();
    res.json(qr);
  } catch (err: unknown) {
    const error = err as Error;
    // Instância já conectada — não há QR para exibir
    if (error.message.includes("já está conectado")) {
      res.status(200).json({ connected: true, message: error.message });
      return;
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;
