/**
 * campaigns.ts
 * Rotas de campanhas (CRUD + controle de fila)
 */

import { Router } from "express";
import * as queue from "../services/queue.js";
import { gerarExemplos, validarSpintax, detectarVariaveis, Contato } from "../services/messageParser.js";
import { prisma } from "../db.js";

const router = Router();

// GET /api/campaigns — lista campanhas
router.get("/", async (_req, res) => {
  const campanhas = await prisma.campanha.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { contatos: true, envios: true } } },
  });
  res.json(campanhas);
});

// GET /api/campaigns/:id — detalhes da campanha
router.get("/:id", async (req, res) => {
  const campanha = await prisma.campanha.findUnique({
    where: { id: req.params.id },
    include: {
      contatos: { include: { contato: true } },
      envios: { orderBy: { enviadoEm: "desc" }, take: 100 },
    },
  });
  if (!campanha) {
    res.status(404).json({ error: "Campanha não encontrada" });
    return;
  }
  res.json(campanha);
});

// POST /api/campaigns — cria campanha
router.post("/", async (req, res) => {
  const {
    nome,
    tipoDisparo,
    textoMensagem,
    imagemUrl,
    audioUrl,
    variavelFallback,
    contatoIds,
    agendarPara,
    delayEntreMsgMin,
    delayEntreMsgMax,
    delayImagemTexto,
    limitePorHora,
    limitePorDia,
  } = req.body;

  if (!nome || !tipoDisparo || !textoMensagem) {
    res.status(400).json({ error: "nome, tipoDisparo e textoMensagem são obrigatórios" });
    return;
  }

  // Valida spintax
  const validacao = validarSpintax(textoMensagem);
  if (!validacao.valido) {
    res.status(400).json({ error: `Spintax inválido: ${validacao.erro}` });
    return;
  }

  const campanha = await prisma.campanha.create({
    data: {
      nome,
      tipoDisparo,
      textoMensagem,
      imagemUrl: imagemUrl || null,
      audioUrl: audioUrl || null,
      variavelFallback: variavelFallback || null,
      agendarPara: agendarPara ? new Date(agendarPara) : null,
      status: agendarPara ? "agendada" : "rascunho",
      delayEntreMsgMin: delayEntreMsgMin || 20,
      delayEntreMsgMax: delayEntreMsgMax || 40,
      delayImagemTexto: delayImagemTexto || 4,
      limitePorHora: limitePorHora || null,
      limitePorDia: limitePorDia || null,
      totalContatos: contatoIds?.length || 0,
    },
  });

  // Vincula contatos
  if (contatoIds && contatoIds.length > 0) {
    await prisma.campanhaContato.createMany({
      data: contatoIds.map((contatoId: string) => ({
        campanhaId: campanha.id,
        contatoId,
        status: "pendente",
      })),
    });
  }

  res.json(campanha);
});

// POST /api/campaigns/:id/start — inicia disparo
router.post("/:id/start", async (req, res) => {
  const campanha = await prisma.campanha.findUnique({ where: { id: req.params.id } });
  if (!campanha) {
    res.status(404).json({ error: "Campanha não encontrada" });
    return;
  }
  if (campanha.status !== "rascunho" && campanha.status !== "pausada") {
    res.status(400).json({ error: `Não é possível iniciar campanha com status "${campanha.status}"` });
    return;
  }

  await queue.enfileirarCampanha(campanha.id);
  queue.processarFila().catch((e) => console.error("[FILA] Erro:", e));

  res.json({ message: "Campanha iniciada", status: "em_andamento" });
});

// POST /api/campaigns/:id/pause — pausa campanha
router.post("/:id/pause", async (req, res) => {
  queue.pausarFila();
  await prisma.campanha.update({ where: { id: req.params.id }, data: { status: "pausada" } });
  res.json({ message: "Campanha pausada" });
});

// POST /api/campaigns/:id/resume — retoma campanha
router.post("/:id/resume", async (req, res) => {
  queue.retomarFila();
  await prisma.campanha.update({ where: { id: req.params.id }, data: { status: "em_andamento" } });
  res.json({ message: "Campanha retomada" });
});

// POST /api/campaigns/:id/cancel — cancela campanha
router.post("/:id/cancel", async (req, res) => {
  queue.cancelarFila();
  await prisma.campanha.update({ where: { id: req.params.id }, data: { status: "cancelada" } });
  res.json({ message: "Campanha cancelada" });
});

// POST /api/campaigns/:id/preview — gera exemplos de mensagem
router.post("/:id/preview", async (req, res) => {
  const { contatoId } = req.body;
  const campanha = await prisma.campanha.findUnique({ where: { id: req.params.id } });
  if (!campanha) {
    res.status(404).json({ error: "Campanha não encontrada" });
    return;
  }

  const contato = contatoId
    ? await prisma.contato.findUnique({ where: { id: contatoId } })
    : await prisma.contato.findFirst();

  if (!contato) {
    res.status(404).json({ error: "Nenhum contato encontrado para preview" });
    return;
  }

  const exemplos = gerarExemplos(
    campanha.textoMensagem,
    contato as unknown as Contato,
    campanha.variavelFallback || undefined
  );

  res.json({ contato, exemplos });
});

// GET /api/campaigns/variables/:headers — detecta variáveis disponíveis dos headers
router.get("/variables/:headers", (req, res) => {
  const headers = decodeURIComponent(req.params.headers).split(",");
  const variaveis = detectarVariaveis(headers);
  res.json({ variaveis });
});

// GET /api/campaigns/status — status geral do sistema
router.get("/system/status", async (_req, res) => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [enviadosHoje, naFila, comErro, totalCampanhas] = await Promise.all([
    prisma.envio.count({ where: { status: "enviado", enviadoEm: { gte: hoje } } }),
    prisma.campanhaContato.count({ where: { status: "pendente" } }),
    prisma.envio.count({ where: { status: "erro" } }),
    prisma.campanha.count(),
  ]);

  const statusConexao = await (await import("../services/wapiClient.js")).checkStatus();

  res.json({
    enviadosHoje,
    naFila,
    comErro,
    totalCampanhas,
    conectado: statusConexao.status === "connected",
    filaProcessando: queue.isProcessando(),
    filaPausado: queue.isPausado(),
    tamanhoFila: queue.getTamanhoFila(),
  });
});

export default router;
