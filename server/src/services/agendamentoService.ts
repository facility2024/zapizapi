/**
 * agendamentoService.ts
 * Regras de agendamento com fuso America/Sao_Paulo (UTC-3, sem DST desde 2019)
 * - Armazena sempre em UTC no banco
 * - Usa luxon para conversão confiável (IANA zone), nunca offset manual
 * - Valida passado, janela 22h-08h, rate limiting, recorrência e retry
 */

import { DateTime } from "luxon";
import { prisma } from "../db.js";

export const TZ = "America/Sao_Paulo";
export const STATUS = {
  PENDENTE: "pendente",
  ENVIADO: "enviado",
  FALHOU: "falhou",
  CANCELADO: "cancelado",
  AGENDADA: "agendada",
} as const;

export const RECORRENCIA = ["nenhuma", "diaria", "semanal", "mensal"] as const;
export type Recorrencia = typeof RECORRENCIA[number];

// Janela de envio permitida (boas práticas WhatsApp): 08:00-22:00 BRT
export const HORARIO_LIMITE_INICIO = 8;
export const HORARIO_LIMITE_FIM = 22;

// Rate limiting padrão (evitar bloqueio)
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 20;
export const DEFAULT_MAX_TENTATIVAS = 3;

// Converte string ISO com offset (ex: 2026-09-05T14:30:00-03:00) ou sem offset (assume BRT) para UTC Date
export function paraUTC(input: string): Date {
  // Se já tem offset/Z, luxon usa corretamente
  let dt = DateTime.fromISO(input, { setZone: true });
  if (!dt.isValid) {
    // Tenta parsear como BRT sem offset (ex: 2026-09-05T14:30)
    dt = DateTime.fromISO(input, { zone: TZ });
  }
  if (!dt.isValid) throw new Error(`Data inválida: ${input} (${dt.invalidReason})`);
  return dt.toUTC().toJSDate();
}

// UTC Date -> ISO em BRT com offset -03:00 para exibição
export function paraBRT(utcDate: Date | string): string {
  const dt = typeof utcDate === "string" ? DateTime.fromJSDate(new Date(utcDate)) : DateTime.fromJSDate(utcDate);
  return dt.setZone(TZ).toISO()!; // ex: 2026-09-05T14:30:00.000-03:00
}

export function formatarBRT(utcDate: Date | string): string {
  const dt = typeof utcDate === "string" ? DateTime.fromJSDate(new Date(utcDate), { zone: "utc" }) : DateTime.fromJSDate(utcDate, { zone: "utc" });
  return dt.setZone(TZ).toFormat("dd/MM/yyyy HH:mm") + " (Horário de Brasília)";
}

export function agoraBRT(): DateTime {
  return DateTime.now().setZone(TZ);
}

export function agoraUTC(): Date {
  return new Date();
}

// Verifica se horario BRT está dentro da janela permitida
export function dentroDaJanelaPermitida(utcDate: Date): boolean {
  const brt = DateTime.fromJSDate(utcDate, { zone: "utc" }).setZone(TZ);
  const hora = brt.hour;
  return hora >= HORARIO_LIMITE_INICIO && hora < HORARIO_LIMITE_FIM;
}

// Calcula próximo horário dentro da janela (ex: 22:30 -> 08:00 do dia seguinte)
export function proximoHorarioPermitido(utcDate: Date): Date {
  let brt = DateTime.fromJSDate(utcDate, { zone: "utc" }).setZone(TZ);
  if (dentroDaJanelaPermitida(utcDate)) return utcDate;
  if (brt.hour >= HORARIO_LIMITE_FIM) {
    // Depois das 22h -> 08:00 do dia seguinte
    brt = brt.plus({ days: 1 }).set({ hour: HORARIO_LIMITE_INICIO, minute: 0, second: 0, millisecond: 0 });
  } else if (brt.hour < HORARIO_LIMITE_INICIO) {
    // Antes das 08h -> 08:00 do mesmo dia
    brt = brt.set({ hour: HORARIO_LIMITE_INICIO, minute: 0, second: 0, millisecond: 0 });
  }
  return brt.toUTC().toJSDate();
}

// Valida agendamento contra o agora em BRT (não permite passado)
export function validarAgendamento(dataHoraEnvioISO: string, recorrencia: string = "nenhuma"): { utc: Date; brt: DateTime } {
  if (!RECORRENCIA.includes(recorrencia as Recorrencia)) {
    throw new Error(`Recorrência inválida. Use: ${RECORRENCIA.join(" | ")}`);
  }
  const utc = paraUTC(dataHoraEnvioISO);
  const brt = DateTime.fromJSDate(utc, { zone: "utc" }).setZone(TZ);
  const agora = agoraBRT();
  // Permite 60s de tolerância para evitar rejeitar por clock skew
  if (brt.toMillis() < agora.minus({ seconds: 60 }).toMillis()) {
    throw new Error(`Não é permitido agendar no passado. Agora em Brasília: ${agora.toFormat("dd/MM/yyyy HH:mm")} (Horário de Brasília)`);
  }
  return { utc, brt };
}

export function proximaRecorrencia(utcDate: Date, recorrencia: Recorrencia): Date | null {
  if (recorrencia === "nenhuma") return null;
  const brt = DateTime.fromJSDate(utcDate, { zone: "utc" }).setZone(TZ);
  let proximo: DateTime;
  if (recorrencia === "diaria") proximo = brt.plus({ days: 1 });
  else if (recorrencia === "semanal") proximo = brt.plus({ weeks: 1 });
  else if (recorrencia === "mensal") proximo = brt.plus({ months: 1 });
  else return null;
  return proximo.toUTC().toJSDate();
}

// Rate limiting simples: conta envios na última janela
export async function podeEnviar(campanhaId?: string, limitePorMinuto: number = DEFAULT_RATE_LIMIT_PER_MINUTE): Promise<boolean> {
  const umMinutoAtras = new Date(Date.now() - 60_000);
  const count = await prisma.envio.count({
    where: {
      ...(campanhaId ? { campanhaId } : {}),
      enviadoEm: { gte: umMinutoAtras },
      status: "enviado",
    },
  });
  return count < limitePorMinuto;
}

// Calcula backoff exponencial para retry (ex: tentativa 1 -> 2min, 2 -> 4min, 3 -> 8min)
export function calcularBackoff(tentativa: number): number {
  const baseMs = 2 * 60 * 1000; // 2 min
  return baseMs * Math.pow(2, tentativa - 1);
}

// Auditoria: registra log
export async function registrarLog(params: {
  agendamentoId?: string | null;
  campanhaId?: string | null;
  acao: string;
  detalhes?: string;
}) {
  try {
    await prisma.agendamentoLog.create({
      data: {
        agendamentoId: params.agendamentoId || null,
        campanhaId: params.campanhaId || null,
        acao: params.acao,
        detalhes: params.detalhes || null,
      },
    });
  } catch (e) {
    console.error("[AGENDAMENTO] Falha ao registrar log:", e);
  }
  // Também loga no console para auditoria
  console.log(`[AGENDAMENTO][${params.acao}] ${params.detalhes || ""} ${params.agendamentoId || params.campanhaId || ""}`);
}
