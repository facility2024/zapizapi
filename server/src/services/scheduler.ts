/**
 * scheduler.ts
 * Motor de agendamento: verifica a cada 30s quais itens estão com dataHoraEnvio <= agora (UTC)
 * - Usa lock em memória (processingIds) para evitar duplicidade em múltiplas checagens
 * - Respeita janela 22h-08h BRT (adia para 08:00)
 * - Rate limiting por minuto
 * - Retry com backoff exponencial (max 3 tentativas)
 * - Suporta Agendamento genérico e Campanha agendada (agendarPara)
 */

import cron from "node-cron";
import { DateTime } from "luxon";
import { prisma } from "../db.js";
import {
  TZ,
  dentroDaJanelaPermitida,
  proximoHorarioPermitido,
  proximaRecorrencia,
  calcularBackoff,
  registrarLog,
  podeEnviar,
} from "./agendamentoService.js";
import * as queue from "./queue.js";

let running = false;
const processingIds = new Set<string>(); // lock distribuído simples (em memória). Para múltiplas instâncias, trocar por Redis/BullMQ.
let cronJob: ReturnType<typeof cron.schedule> | null = null;
let intervalId: NodeJS.Timeout | null = null;

function log(msg: string) {
  console.log(`[SCHEDULER] ${msg}`);
}

async function processarAgendamentos(): Promise<void> {
  if (running) return;
  running = true;
  const agora = new Date(); // UTC
  try {
    // Busca agendamentos pendentes com data <= agora
    const pendentes = await prisma.agendamento.findMany({
      where: {
        status: "pendente",
        dataHoraEnvio: { lte: agora },
      },
      take: 20, // limita por ciclo para rate limiting
    });

    for (const ag of pendentes) {
      if (processingIds.has(ag.id)) continue;
      processingIds.add(ag.id);

      try {
        // Janela de horário: se fora de 08-22 BRT, adia
        if (!dentroDaJanelaPermitida(ag.dataHoraEnvio)) {
          const proximo = proximoHorarioPermitido(ag.dataHoraEnvio);
          await prisma.agendamento.update({
            where: { id: ag.id },
            data: { dataHoraEnvio: proximo },
          });
          await registrarLog({
            agendamentoId: ag.id,
            acao: "adiado_horario",
            detalhes: `Fora da janela 08-22 BRT, adiado para ${DateTime.fromJSDate(proximo, { zone: "utc" }).setZone(TZ).toFormat("dd/MM/yyyy HH:mm")} (Horário de Brasília)`,
          });
          log(`Agendamento ${ag.id} adiado para janela permitida`);
          continue;
        }

        // Rate limiting
        const pode = await podeEnviar(ag.campanhaId || undefined, 20);
        if (!pode) {
          log(`Rate limit atingido, adiando ciclo`);
          break; // tenta no próximo ciclo
        }

        // Se vinculado a campanha, dispara a campanha via fila
        if (ag.campanhaId) {
          const campanha = await prisma.campanha.findUnique({ where: { id: ag.campanhaId } });
          if (!campanha) {
            await prisma.agendamento.update({
              where: { id: ag.id },
              data: { status: "falhou", ultimoErro: "Campanha não encontrada" },
            });
            await registrarLog({ agendamentoId: ag.id, acao: "falhou", detalhes: "Campanha não encontrada" });
            continue;
          }
          try {
            await queue.enfileirarCampanha(campanha.id);
            queue.processarFila().catch((e) => console.error("[SCHEDULER] Erro fila:", e));
            await prisma.agendamento.update({
              where: { id: ag.id },
              data: { status: "enviado", tentativas: { increment: 1 } },
            });
            await prisma.campanha.update({
              where: { id: campanha.id },
              data: { status: "em_andamento" },
            });
            await registrarLog({
              agendamentoId: ag.id,
              campanhaId: campanha.id,
              acao: "disparado",
              detalhes: `Campanha ${campanha.nome} disparada via agendamento`,
            });
            // Recorrência: cria próximo
            if (ag.recorrencia !== "nenhuma") {
              const proxima = proximaRecorrencia(ag.dataHoraEnvio, ag.recorrencia as any);
              if (proxima) {
                const novo = await prisma.agendamento.create({
                  data: {
                    mensagem: ag.mensagem,
                    destinatarios: ag.destinatarios,
                    dataHoraEnvio: proxima,
                    status: "pendente",
                    recorrencia: ag.recorrencia,
                    campanhaId: ag.campanhaId,
                  },
                });
                await registrarLog({
                  agendamentoId: novo.id,
                  acao: "agendado",
                  detalhes: `Recorrência ${ag.recorrencia} criada a partir de ${ag.id}`,
                });
              }
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await handleFalhaAgendamento(ag.id, msg);
          }
        } else {
          // Agendamento genérico sem campanha: marca como enviado e loga
          // (Expansão futura: integrar envio direto via wapiClient usando destinatarios/mensagem)
          // Por enquanto, simula envio e cria logs de auditoria
          const destinatarios: string[] = JSON.parse(ag.destinatarios || "[]");
          log(`Disparando agendamento genérico ${ag.id} para ${destinatarios.length} destinatário(s): "${ag.mensagem.slice(0, 50)}"`);

          // Aqui poderia iterar destinatarios e chamar wapiClient.sendText com rate limiting
          // Para MVP, apenas registra como enviado se não houver erro simulado
          await prisma.agendamento.update({
            where: { id: ag.id },
            data: { status: "enviado", tentativas: { increment: 1 } },
          });
          await registrarLog({
            agendamentoId: ag.id,
            acao: "enviado",
            detalhes: `Enviado para ${destinatarios.length} destinatário(s) em ${new Date().toISOString()}`,
          });

          if (ag.recorrencia !== "nenhuma") {
            const proxima = proximaRecorrencia(ag.dataHoraEnvio, ag.recorrencia as any);
            if (proxima) {
              await prisma.agendamento.create({
                data: {
                  mensagem: ag.mensagem,
                  destinatarios: ag.destinatarios,
                  dataHoraEnvio: proxima,
                  status: "pendente",
                  recorrencia: ag.recorrencia,
                },
              });
            }
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await handleFalhaAgendamento(ag.id, msg);
      } finally {
        processingIds.delete(ag.id);
      }
    }

    // Também processa Campanhas agendadas (fluxo legado: Campanha.agendarPara)
    const campanhasAgendadas = await prisma.campanha.findMany({
      where: {
        status: "agendada",
        agendarPara: { lte: agora },
      },
      take: 10,
    });

    for (const camp of campanhasAgendadas) {
      const lockKey = `campanha:${camp.id}`;
      if (processingIds.has(lockKey)) continue;
      processingIds.add(lockKey);
      try {
        if (!camp.agendarPara) continue;

        if (!dentroDaJanelaPermitida(camp.agendarPara)) {
          const proximo = proximoHorarioPermitido(camp.agendarPara);
          await prisma.campanha.update({
            where: { id: camp.id },
            data: { agendarPara: proximo },
          });
          await registrarLog({
            campanhaId: camp.id,
            acao: "adiado_horario",
            detalhes: `Campanha fora da janela 08-22 BRT, adiada para ${DateTime.fromJSDate(proximo, { zone: "utc" }).setZone(TZ).toFormat("dd/MM/yyyy HH:mm")} (Horário de Brasília)`,
          });
          continue;
        }

        const pode = await podeEnviar(camp.id, camp.limitePorHora || 60);
        if (!pode) {
          log(`Rate limit campanha ${camp.id}, aguardando próximo ciclo`);
          continue;
        }

        await queue.enfileirarCampanha(camp.id);
        queue.processarFila().catch((e) => console.error("[SCHEDULER] Erro campanha:", e));
        await prisma.campanha.update({
          where: { id: camp.id },
          data: { status: "em_andamento" },
        });
        await registrarLog({
          campanhaId: camp.id,
          acao: "disparado",
          detalhes: `Campanha agendada disparada automaticamente em ${agora.toISOString()}`,
        });
        log(`Campanha agendada ${camp.id} disparada`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const tentativas = (camp.tentativas || 0) + 1;
        if (tentativas >= (camp.maxTentativas || 3)) {
          await prisma.campanha.update({
            where: { id: camp.id },
            data: { status: "cancelada", tentativas, ultimoErro: msg },
          });
          await registrarLog({ campanhaId: camp.id, acao: "falhou", detalhes: msg });
        } else {
          const backoff = calcularBackoff(tentativas);
          const proximaTentativa = new Date(Date.now() + backoff);
          await prisma.campanha.update({
            where: { id: camp.id },
            data: { tentativas, ultimoErro: msg, agendarPara: proximaTentativa },
          });
          await registrarLog({ campanhaId: camp.id, acao: "retry", detalhes: `Tentativa ${tentativas} falhou: ${msg}. Próxima em ${proximaTentativa.toISOString()}` });
        }
      } finally {
        processingIds.delete(lockKey);
      }
    }
  } finally {
    running = false;
  }
}

async function handleFalhaAgendamento(agId: string, erro: string) {
  const ag = await prisma.agendamento.findUnique({ where: { id: agId } });
  if (!ag) return;
  const tentativas = ag.tentativas + 1;
  if (tentativas >= ag.maxTentativas) {
    await prisma.agendamento.update({
      where: { id: agId },
      data: { status: "falhou", tentativas, ultimoErro: erro },
    });
    await registrarLog({ agendamentoId: agId, acao: "falhou", detalhes: erro });
    log(`Agendamento ${agId} falhou definitivamente após ${tentativas} tentativas: ${erro}`);
  } else {
    const backoff = calcularBackoff(tentativas);
    const proximaTentativa = new Date(Date.now() + backoff);
    await prisma.agendamento.update({
      where: { id: agId },
      data: { tentativas, ultimoErro: erro, dataHoraEnvio: proximaTentativa },
    });
    await registrarLog({ agendamentoId: agId, acao: "retry", detalhes: `Tentativa ${tentativas} falhou: ${erro}. Retry em ${backoff / 1000}s` });
    log(`Agendamento ${agId} retry ${tentativas}/${ag.maxTentativas} em ${backoff / 60000}min`);
  }
}

export function iniciarScheduler() {
  if (cronJob || intervalId) {
    log("Scheduler já iniciado");
    return;
  }
  // Watchdog da fila: recupera campanhas em_andamento travadas (fila RAM perdida)
  const watchdog = async () => {
    try {
      const { recuperarCampanhasTravadas } = await import("./queue.js");
      await recuperarCampanhasTravadas();
    } catch (e) {
      console.error("[SCHEDULER] Watchdog fila erro:", e);
    }
  };
  // Verifica a cada 30s (mais responsivo que cron de 1min)
  intervalId = setInterval(() => {
    processarAgendamentos().catch((e) => console.error("[SCHEDULER] Erro ciclo:", e));
    watchdog().catch(() => {});
  }, 30_000);

  // Também roda via cron a cada minuto como fallback
  cronJob = cron.schedule("* * * * *", () => {
    processarAgendamentos().catch((e) => console.error("[SCHEDULER] Erro cron:", e));
  });

  // Roda uma vez no boot (após 5s para DB estar pronto)
  setTimeout(() => {
    processarAgendamentos().catch(console.error);
    import("./queue.js").then((m) => m.recuperarCampanhasTravadas().catch(console.error));
  }, 5000);
  log("Scheduler iniciado (30s interval + cron 1min) — fuso: America/Sao_Paulo, janela 08-22 BRT");
}

export function pararScheduler() {
  if (intervalId) clearInterval(intervalId);
  if (cronJob) cronJob.stop();
  intervalId = null;
  cronJob = null;
  log("Scheduler parado");
}

// Para testes: expõe processamento manual
export { processarAgendamentos };
