/**
 * campaigns.ts
 * Rotas de campanhas (CRUD + controle de fila)
 */

import { Router } from "express";
import * as queue from "../services/queue.js";
import { gerarExemplos, validarSpintax, detectarVariaveis, Contato } from "../services/messageParser.js";
import { prisma } from "../db.js";
import { validarAgendamento, paraBRT, formatarBRT, paraUTC, registrarLog } from "../services/agendamentoService.js";

const router = Router();

// GET /api/campaigns — lista campanhas (com conversão BRT)
router.get("/", async (_req, res) => {
  const campanhas = await prisma.campanha.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { contatos: true, envios: true } } },
  });
  const comBRT = campanhas.map((c: any) => ({
    ...c,
    agendarParaBRT: c.agendarPara ? paraBRT(c.agendarPara) : null,
    agendarParaLabel: c.agendarPara ? formatarBRT(c.agendarPara) : null,
  }));
  res.json(comBRT);
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
  res.json({
    ...campanha,
    agendarParaBRT: campanha.agendarPara ? paraBRT(campanha.agendarPara) : null,
    agendarParaLabel: campanha.agendarPara ? formatarBRT(campanha.agendarPara) : null,
  } as any);
});

// POST /api/campaigns — cria campanha
router.post("/", async (req, res) => {
  try {
    const {
      nome,
      tipoDisparo,
      textoMensagem,
      imagemUrl,
      imagensUrls,
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

    // Validação de agendamento: converte BRT -> UTC e valida passado
    let agendarParaUTC: Date | null = null;
    if (agendarPara) {
      try {
        const v = validarAgendamento(agendarPara, req.body.recorrencia || "nenhuma");
        agendarParaUTC = v.utc;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(400).json({ error: msg });
        return;
      }
    }

    const campanha = await prisma.campanha.create({
      data: {
        nome,
        tipoDisparo,
        textoMensagem,
        imagemUrl: imagemUrl || (imagensUrls ? (JSON.parse(imagensUrls)[0] ?? null) : null),
        imagensUrls: imagensUrls || null,
        audioUrl: audioUrl || null,
        variavelFallback: variavelFallback || null,
        agendarPara: agendarParaUTC,
        recorrencia: req.body.recorrencia || "nenhuma",
        status: agendarPara ? "agendada" : "rascunho",
        delayEntreMsgMin: delayEntreMsgMin || 20,
        delayEntreMsgMax: delayEntreMsgMax || 40,
        delayImagemTexto: delayImagemTexto || 4,
        limitePorHora: limitePorHora || null,
        limitePorDia: limitePorDia || null,
        totalContatos: contatoIds?.length || 0,
      },
    });
    if (agendarParaUTC) {
      await registrarLog({ campanhaId: campanha.id, acao: "agendado", detalhes: `Agendada para ${formatarBRT(agendarParaUTC)}` });
    }

    // Vincula contatos (remove duplicatas)
    if (contatoIds && contatoIds.length > 0) {
      const unicos = [...new Set(contatoIds)];
      await prisma.campanhaContato.createMany({
        data: unicos.map((contatoId: string) => ({
          campanhaId: campanha.id,
          contatoId,
          status: "pendente",
        })),
      });
    }

    res.json(campanha);
  } catch (err: unknown) {
    console.error("[CAMPANHA] Erro ao criar:", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido ao criar campanha";
    res.status(500).json({ error: msg });
  }
});

// POST /api/campaigns/:id/start — inicia disparo
router.post("/:id/start", async (req, res) => {
  try {
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
  } catch (err: unknown) {
    console.error("[CAMPANHA] Erro ao iniciar:", err);
    const msg = err instanceof Error ? err.message : "Erro ao iniciar campanha";
    res.status(500).json({ error: msg });
  }
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
  // Reinicia o processamento caso a fila tenha parado (ex.: por desconexão)
  queue.processarFila().catch((e) => console.error("[FILA] Erro ao retomar:", e));
  res.json({ message: "Campanha retomada" });
});

// PUT /api/campaigns/:id — edita campanha (permite editar agendamento antes do disparo)
router.put("/:id", async (req, res) => {
  const existente = await prisma.campanha.findUnique({ where: { id: req.params.id } });
  if (!existente) { res.status(404).json({ error: "Campanha não encontrada" }); return; }
  if (!["rascunho", "agendada", "pausada"].includes(existente.status)) {
    res.status(400).json({ error: `Não é possível editar campanha com status "${existente.status}"` }); return;
  }
  const { nome, textoMensagem, agendarPara, recorrencia, limitePorHora, limitePorDia } = req.body;
  const update: any = {};
  if (nome !== undefined) update.nome = nome;
  if (textoMensagem !== undefined) {
    const v = validarSpintax(textoMensagem);
    if (!v.valido) { res.status(400).json({ error: `Spintax inválido: ${v.erro}` }); return; }
    update.textoMensagem = textoMensagem;
  }
  if (recorrencia !== undefined) update.recorrencia = recorrencia;
  if (limitePorHora !== undefined) update.limitePorHora = limitePorHora;
  if (limitePorDia !== undefined) update.limitePorDia = limitePorDia;
  if (agendarPara !== undefined) {
    if (agendarPara === null || agendarPara === "") {
      update.agendarPara = null;
      update.status = "rascunho";
    } else {
      try {
        const v = validarAgendamento(agendarPara, recorrencia || existente.recorrencia || "nenhuma");
        update.agendarPara = v.utc;
        update.status = "agendada";
        await registrarLog({ campanhaId: existente.id, acao: "reagendado", detalhes: `Reagendada para ${formatarBRT(v.utc)}` });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(400).json({ error: msg }); return;
      }
    }
  }
  const updated = await prisma.campanha.update({ where: { id: existente.id }, data: update });
  res.json({ ...updated, agendarParaBRT: updated.agendarPara ? paraBRT(updated.agendarPara) : null, agendarParaLabel: updated.agendarPara ? formatarBRT(updated.agendarPara) : null } as any);
});

// POST /api/campaigns/:id/cancel — cancela campanha
router.post("/:id/cancel", async (req, res) => {
  queue.cancelarFila();
  await prisma.campanha.update({ where: { id: req.params.id }, data: { status: "cancelada" } });
  await registrarLog({ campanhaId: req.params.id, acao: "cancelado", detalhes: "Cancelada pelo usuário" });
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
