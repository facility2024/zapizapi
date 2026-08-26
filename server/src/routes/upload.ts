/**
 * upload.ts
 * Rota de upload de planilha de contatos
 */

import { Router } from "express";
import multer from "multer";
import { parsePlanilha } from "../services/excelParser.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

// POST /api/upload — upload de planilha
router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Nenhum arquivo enviado" });
    return;
  }

  const ext = req.file.originalname.split(".").pop()?.toLowerCase();
  if (!["xlsx", "xls", "csv"].includes(ext || "")) {
    res.status(400).json({ error: "Formato inválido. Use .xlsx, .xls ou .csv" });
    return;
  }

  const resultado = parsePlanilha(req.file.buffer, req.file.originalname);

  if (resultado.erros.length > 0 && resultado.validos === 0) {
    res.status(400).json({ error: resultado.erros[0], erros: resultado.erros });
    return;
  }

  // Salva contatos no banco
  const contatosSalvos = [];
  for (const c of resultado.contatos) {
    const contato = await prisma.contato.upsert({
      where: { numero: c.numero },
      update: {
        nome: c.nome || undefined,
        empresa: c.empresa || undefined,
        cidade: c.cidade || undefined,
        extras: JSON.stringify(c.extras),
      },
      create: {
        numero: c.numero,
        nome: c.nome,
        empresa: c.empresa,
        cidade: c.cidade,
        extras: JSON.stringify(c.extras),
      },
    });
    contatosSalvos.push(contato);
  }

  res.json({
    contatos: contatosSalvos,
    headers: resultado.headers,
    validos: resultado.validos,
    invalidos: resultado.invalidos,
    erros: resultado.erros.slice(0, 10), // Limita erros retornados
  });
});

export default router;
