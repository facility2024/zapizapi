/**
 * agendamentos.ts
 * CRUD de Agendamentos com fuso America/Sao_Paulo
 * - Armazena em UTC, exibe em BRT
 * - Valida passado, janela 22-08, recorrência e rate limit
 */

import { Router } from "express";
import { prisma } from "../db.js";
import {
  TZ,
  RECORRENCIA,
  validarAgendamento,
  paraUTC,
  paraBRT,
  formatarBRT,
  proximoHorarioPermitido,
  dentroDaJanelaPermitida,
  registrarLog,
} from "../services/agendamentoService.js";
import { DateTime } from "luxon";

const router = Router();

function serialize(ag: any) {
  return {
    ...ag,
    destinatarios: JSON.parse(ag.destinatarios || "[]"),
    data_hora_envio: paraBRT(ag.dataHoraEnvio),
    data_hora_envio_utc: ag.dataHoraEnvio,
    data_hora_envio_brt_label: formatarBRT(ag.dataHoraEnvio),
    criado_em: ag.criadoEm,
  };
}

// GET /api/agendamentos — lista com filtros opcionais
router.get("/", async (req, res) => {
  const { status, recorrencia } = req.query as any;
  const where: any = {};
  if (status) where.status = status;
  if (recorrencia) where.recorrencia = recorrencia;
  const lista = await prisma.agendamento.findMany({
    where,
    orderBy: { dataHoraEnvio: "asc" },
    include: { logs: { orderBy: { criadoEm: "desc" }, take: 20 } },
  });
  res.json(lista.map(serialize));
});

// GET /api/agendamentos/:id
router.get("/:id", async (req, res) => {
  const ag = await prisma.agendamento.findUnique({
    where: { id: req.params.id },
    include: { logs: { orderBy: { criadoEm: "desc" } } },
  });
  if (!ag) { res.status(404).json({ error: "Agendamento não encontrado" }); return; }
  res.json(serialize(ag));
});

// POST /api/agendamentos — cria
// Body: { mensagem, destinatarios: ["5511..."], data_hora_envio: "2026-09-05T14:30:00-03:00", recorrencia?, campanhaId? }
router.post("/", async (req, res) => {
  const { mensagem, destinatarios, data_hora_envio, recorrencia = "nenhuma", campanhaId } = req.body;

  if (!mensagem || typeof mensagem !== "string" || mensagem.trim().length === 0) {
    res.status(400).json({ error: "mensagem é obrigatória" }); return;
  }
  if (!Array.isArray(destinatarios) || destinatarios.length === 0) {
    res.status(400).json({ error: "destinatarios deve ser array com ao menos 1 número" }); return;
  }
  // Validação simples de números (mesmo padrão do excelParser)
  for (const n of destinatarios) {
    const digits = String(n).replace(/\D/g, "");
    if (digits.length < 12 || digits.length > 13) {
      res.status(400).json({ error: `Número inválido: ${n} (use DDD + número, será normalizado com 55)` }); return;
    }
  }
  if (!data_hora_envio) {
    res.status(400).json({ error: "data_hora_envio é obrigatória (ISO com offset -03:00, ex: 2026-09-05T14:30:00-03:00)" }); return;
  }
  if (!RECORRENCIA.includes(recorrencia)) {
    res.status(400).json({ error: `recorrencia inválida. Use: ${RECORRENCIA.join(", ")}` }); return;
  }

  let utc: Date;
  try {
    const v = validarAgendamento(data_hora_envio, recorrencia);
    utc = v.utc;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg }); return;
  }

  // Aviso se fora da janela permitida (não bloqueia, mas adia no scheduler)
  let avisoJanela: string | null = null;
  if (!dentroDaJanelaPermitida(utc)) {
    const proximo = proximoHorarioPermitido(utc);
    avisoJanela = `Fora da janela 08-22 BRT. Será enviado em ${formatarBRT(proximo)}`;
  }

  // Normaliza destinatários (garante 55)
  const destNorm = destinatarios.map((n: string) => {
    let d = String(n).replace(/\D/g, "");
    if (!d.startsWith("55")) d = "55" + d;
    return d;
  });

  const ag = await prisma.agendamento.create({
    data: {
      mensagem: mensagem.trim(),
      destinatarios: JSON.stringify(destNorm),
      dataHoraEnvio: utc,
      status: "pendente",
      recorrencia,
      campanhaId: campanhaId || null,
    },
  });

  await registrarLog({ agendamentoId: ag.id, campanhaId, acao: "agendado", detalhes: `Agendado para ${formatarBRT(utc)} | recorrência: ${recorrencia}` });

  res.status(201).json({ ...serialize(ag), aviso: avisoJanela });
});

// PUT /api/agendamentos/:id — edita antes do disparo
router.put("/:id", async (req, res) => {
  const ag = await prisma.agendamento.findUnique({ where: { id: req.params.id } });
  if (!ag) { res.status(404).json({ error: "Agendamento não encontrado" }); return; }
  if (ag.status !== "pendente") {
    res.status(400).json({ error: `Só é possível editar agendamentos pendentes (atual: ${ag.status})` }); return;
  }

  const { mensagem, destinatarios, data_hora_envio, recorrencia } = req.body;
  const update: any = {};

  if (mensagem !== undefined) {
    if (!mensagem || typeof mensagem !== "string") { res.status(400).json({ error: "mensagem inválida" }); return; }
    update.mensagem = mensagem.trim();
  }
  if (destinatarios !== undefined) {
    if (!Array.isArray(destinatarios) || destinatarios.length === 0) { res.status(400).json({ error: "destinatarios inválido" }); return; }
    const destNorm = destinatarios.map((n: string) => {
      let d = String(n).replace(/\D/g, "");
      if (!d.startsWith("55")) d = "55" + d;
      return d;
    });
    update.destinatarios = JSON.stringify(destNorm);
  }
  if (recorrencia !== undefined) {
    if (!RECORRENCIA.includes(recorrencia)) { res.status(400).json({ error: `recorrencia inválida` }); return; }
    update.recorrencia = recorrencia;
  }
  if (data_hora_envio !== undefined) {
    try {
      const v = validarAgendamento(data_hora_envio, recorrencia || ag.recorrencia);
      update.dataHoraEnvio = v.utc;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(400).json({ error: msg }); return;
    }
  }

  const updated = await prisma.agendamento.update({ where: { id: ag.id }, data: update });
  await registrarLog({ agendamentoId: ag.id, acao: "editado", detalhes: `Editado: ${JSON.stringify(update)}` });
  res.json(serialize(updated));
});

// POST /api/agendamentos/:id/cancelar — cancela antes do disparo
router.post("/:id/cancelar", async (req, res) => {
  const ag = await prisma.agendamento.findUnique({ where: { id: req.params.id } });
  if (!ag) { res.status(404).json({ error: "Agendamento não encontrado" }); return; }
  if (ag.status !== "pendente") {
    res.status(400).json({ error: `Só é possível cancelar agendamentos pendentes (atual: ${ag.status})` }); return;
  }
  const updated = await prisma.agendamento.update({ where: { id: ag.id }, data: { status: "cancelado" } });
  await registrarLog({ agendamentoId: ag.id, acao: "cancelado", detalhes: "Cancelado pelo usuário" });
  res.json(serialize(updated));
});

// GET /api/agendamentos/:id/logs — auditoria
router.get("/:id/logs", async (req, res) => {
  const logs = await prisma.agendamentoLog.findMany({
    where: { agendamentoId: req.params.id },
    orderBy: { criadoEm: "desc" },
  });
  res.json(logs);
});

// DELETE /api/agendamentos/:id — remove (só pendente/cancelado/falhou)
router.delete("/:id", async (req, res) => {
  const ag = await prisma.agendamento.findUnique({ where: { id: req.params.id } });
  if (!ag) { res.status(404).json({ error: "Agendamento não encontrado" }); return; }
  if (ag.status === "enviado") {
    res.status(400).json({ error: "Não é possível remover agendamento já enviado" }); return;
  }
  await prisma.agendamentoLog.deleteMany({ where: { agendamentoId: ag.id } });
  await prisma.agendamento.delete({ where: { id: ag.id } });
  res.json({ success: true });
});

export default router;
