/**
 * upload.ts
 * Rota de upload de planilha, mídia e entrada manual de contatos
 */

import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { parsePlanilha } from "../services/excelParser.js";
import { prisma } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Storage para planilhas (memória)
const uploadMemoria = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Storage para mídia (disco)
const uploadMedia = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, "..", "..", "uploads"),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|mp3|wav|m4a|ogg|opus)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error("Formato de arquivo não suportado"));
    }
  },
});

const router = Router();

// POST /api/upload — upload de planilha
router.post("/", uploadMemoria.single("file"), async (req, res) => {
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
// Formato: numero|nome (um por linha). Nome é opcional.
// Exemplo:
//   5511999999999|João
//   11988887777
//   (21) 97777-6666|Maria
router.post("/manual", async (req, res) => {
  try {
    const { numeros } = req.body;

    if (!numeros || typeof numeros !== "string") {
      res.status(400).json({ error: "Envie uma lista de números" });
      return;
    }

    const linhas = numeros.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    const contatosParaSalvar: { numero: string; nome?: string }[] = [];
    const erros: string[] = [];
    let validos = 0;
    let invalidos = 0;

    for (let i = 0; i < linhas.length; i++) {
      const raw = linhas[i];

      // Separa número|nome
      const partes = raw.split("|");
      let numRaw = partes[0].trim();
      const nome = (partes[1] || "").trim() || undefined;

      // Remove tudo que não é dígito do número
      let num = numRaw.replace(/\D/g, "");

      if (!num.startsWith("55")) {
        num = "55" + num;
      }

      if (num.length < 12 || num.length > 13) {
        invalidos++;
        erros.push(`Linha ${i + 1}: número inválido "${numRaw}" (${num.length} dígitos)`);
        continue;
      }

      contatosParaSalvar.push({ numero: num, nome });
      validos++;
    }

    const contatosSalvos = [];
    for (const c of contatosParaSalvar) {
      const contato = await prisma.contato.upsert({
        where: { numero: c.numero },
        update: { nome: c.nome || null },
        create: { numero: c.numero, nome: c.nome },
      });
      contatosSalvos.push({ id: contato.id, numero: contato.numero, nome: contato.nome });
    }

    res.json({
      contatos: contatosSalvos,
      headers: ["numero", "nome"],
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

// POST /api/upload/media — upload de imagem ou áudio
router.post("/media", (req, res) => {
  uploadMedia.single("file")(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || "Erro no upload" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "Nenhum arquivo enviado" });
      return;
    }

    // Retorna URL relativa que o servidor consegue servir
    const url = `/uploads/${req.file.filename}`;
    res.json({ url, filename: req.file.filename });
  });
});

export default router;
