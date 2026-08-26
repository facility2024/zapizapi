/**
 * upload.ts
 * Rota de upload de planilha e entrada manual de contatos
 */

import { Router } from "express";
import multer from "multer";
import { parsePlanilha } from "../services/excelParser.js";
import { prisma } from "../db.js";

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
    erros: resultado.erros.slice(0, 10),
  });
});

// POST /api/upload/manual — entrada manual de números
router.post("/manual", async (req, res) => {
  try {
    console.log("[UPLOAD MANUAL] body:", JSON.stringify(req.body));
    const { numeros } = req.body;

    if (!numeros || typeof numeros !== "string") {
      console.log("[UPLOAD MANUAL] numeros inválido:", typeof numeros);
      res.status(400).json({ error: "Envie uma lista de números" });
      return;
    }

    const linhas = numeros.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    const contatosParaSalvar: { numero: string }[] = [];
    const erros: string[] = [];
    let validos = 0;
    let invalidos = 0;

    for (let i = 0; i < linhas.length; i++) {
      const raw = linhas[i];
      let num = raw.replace(/\D/g, "");

      if (!num.startsWith("55")) {
        num = "55" + num;
      }

      if (num.length < 12 || num.length > 13) {
        invalidos++;
        erros.push(`Linha ${i + 1}: número inválido "${raw}" (${num.length} dígitos)`);
        continue;
      }

      contatosParaSalvar.push({ numero: num });
      validos++;
    }

    const contatosSalvos = [];
    for (const c of contatosParaSalvar) {
      const contato = await prisma.contato.upsert({
        where: { numero: c.numero },
        update: {},
        create: { numero: c.numero },
      });
      contatosSalvos.push({ id: contato.id, numero: contato.numero });
    }

    res.json({
      contatos: contatosSalvos,
      headers: ["numero"],
      validos,
      invalidos,
      erros: erros.slice(0, 20),
    });
  } catch (err: unknown) {
    console.error("[UPLOAD] Erro no envio manual:", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    res.status(500).json({ error: msg });
  }
});

export default router;
