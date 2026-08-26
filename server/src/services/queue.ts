/**
 * queue.ts
 * Motor de fila de envio com delay configurável e persistência via Prisma
 */

import { PrismaClient, Campanha, CampanhaContato, Contato } from "@prisma/client";
import * as wapi from "./wapiClient.js";
import { processarMensagem } from "./messageParser.js";

const prisma = new PrismaClient();

interface FilaItem {
  campanhaId: string;
  contatoId: string;
  contato: Contato;
  campanha: Campanha;
}

// Estado da fila em memória
const fila: FilaItem[] = [];
let processando = false;
let pausado = false;
let cancelado = false;
let campanhaAtualId: string | null = null;

// Callback para atualizar frontend via WebSocket
type StatusCallback = (campanhaId: string, contatoId: string, status: string, erro?: string) => void;
let statusCallback: StatusCallback | null = void 0;

export function onStatusUpdate(cb: StatusCallback) {
  statusCallback = cb;
}

function notify(campanhaId: string, contatoId: string, status: string, erro?: string) {
  if (statusCallback) statusCallback(campanhaId, contatoId, status, erro);
}

/**
 * Retorna delay aleatório entre min e max segundos
 */
function randomDelay(min: number, max: number): number {
  return (Math.random() * (max - min) + min) * 1000;
}

/**
 * Adiciona contatos à fila de uma campanha
 */
export async function enfileirarCampanha(campanhaId: string): Promise<void> {
  const campanha = await prisma.campanha.findUnique({ where: { id: campanhaId } });
  if (!campanha) throw new Error("Campanha não encontrada");

  const contatosNaFila = await prisma.campanhaContato.findMany({
    where: { campanhaId, status: "pendente" },
    include: { contato: true },
  });

  for (const item of contatosNaFila) {
    fila.push({
      campanhaId,
      contatoId: item.contatoId,
      contato: item.contato,
      campanha,
    });
  }

  await prisma.campanha.update({
    where: { id: campanhaId },
    data: { status: "em_andamento" },
  });

  campanhaAtualId = campanhaId;
  cancelado = false;
  pausado = false;
}

/**
 * Processa a fila
 */
export async function processarFila(): Promise<void> {
  if (processando || fila.length === 0) return;
  processando = true;

  while (fila.length > 0 && !cancelado) {
    if (pausado) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }

    const item = fila.shift()!;
    const { campanha, contato, campanhaId, contatoId } = item;

    try {
      // Atualiza status para "enviando"
      await prisma.campanhaContato.update({
        where: { campanhaId_contatoId: { campanhaId, contatoId } },
        data: { status: "enviando" },
      });
      notify(campanhaId, contatoId, "enviando");

      // Verifica status da conexão
      const status = await wapi.checkStatus();
      if (status.status !== "connected") {
        throw new Error("Instância WhatsApp desconectada");
      }

      const numero = contato.numero;

      // Simula digitação
      const tempoDig = wapi.calcularTempoDigitação(campanha.textoMensagem);
      await wapi.setComposing(numero, tempoDig);

      // Envia conforme o tipo
      if (campanha.tipoDisparo === "texto") {
        const msg = processarMensagem(campanha.textoMensagem, contato as unknown as import("./messageParser.js").Contato, campanha.variavelFallback || undefined);
        const resultado = await wapi.sendText(numero, msg);
        if (!resultado.success) throw new Error(resultado.error);

        await registrarEnvio(campanhaId, contatoId, "texto", resultado);
      } else if (campanha.tipoDisparo === "imagem_texto" && campanha.imagemUrl) {
        // Envia imagem
        const resImg = await wapi.sendImage(numero, campanha.imagemUrl);
        if (!resImg.success) throw new Error(resImg.error);
        await registrarEnvio(campanhaId, contatoId, "imagem", resImg);

        // Aguarda delay entre imagem e texto
        await new Promise((r) => setTimeout(r, campanha.delayImagemTexto * 1000));

        // Envia texto
        const msg = processarMensagem(campanha.textoMensagem, contato as unknown as import("./messageParser.js").Contato, campanha.variavelFallback || undefined);
        await wapi.setComposing(numero, wapi.calcularTempoDigitação(msg));
        const resTxt = await wapi.sendText(numero, msg);
        if (!resTxt.success) throw new Error(resTxt.error);
        await registrarEnvio(campanhaId, contatoId, "texto", resTxt);
      } else if (campanha.tipoDisparo === "audio" && campanha.audioUrl) {
        const resAudio = await wapi.sendAudio(numero, campanha.audioUrl);
        if (!resAudio.success) throw new Error(resAudio.error);
        await registrarEnvio(campanhaId, contatoId, "audio", resAudio);
      }

      // Atualiza para "enviado"
      await prisma.campanhaContato.update({
        where: { campanhaId_contatoId: { campanhaId, contatoId } },
        data: { status: "enviado", enviadoEm: new Date() },
      });
      await prisma.campanha.update({
        where: { id: campanhaId },
        data: { enviados: { increment: 1 } },
      });
      notify(campanhaId, contatoId, "enviado");
    } catch (err: unknown) {
      const erro = err instanceof Error ? err.message : "Erro desconhecido";
      await prisma.campanhaContato.update({
        where: { campanhaId_contatoId: { campanhaId, contatoId } },
        data: { status: "erro", errorMsg: erro },
      });
      await prisma.campanha.update({
        where: { id: campanhaId },
        data: { erros: { increment: 1 } },
      });
      notify(campanhaId, contatoId, "erro", erro);
    }

    // Delay entre envios para contatos diferentes
    if (fila.length > 0) {
      const delay = randomDelay(campanha.delayEntreMsgMin, campanha.delayEntreMsgMax);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // Campanha concluída
  if (campanhaAtualId && !cancelado) {
    await prisma.campanha.update({
      where: { id: campanhaAtualId },
      data: { status: "concluida" },
    });
    notify(campanhaAtualId, "", "concluida");
  }

  processando = false;
  campanhaAtualId = null;
}

async function registrarEnvio(campanhaId: string, contatoId: string, tipo: string, resultado: { success: boolean; data?: unknown; error?: string }) {
  await prisma.envio.create({
    data: {
      campanhaId,
      contatoId,
      tipo,
      status: resultado.success ? "enviado" : "erro",
      response: resultado.data ? JSON.stringify(resultado.data) : null,
      errorMsg: resultado.error || null,
    },
  });
}

export function pausarFila(): void {
  pausado = true;
}

export function retomarFila(): void {
  pausado = false;
}

export function cancelarFila(): void {
  cancelado = true;
  fila.length = 0;
}

export function isProcessando(): boolean {
  return processando;
}

export function isPausado(): boolean {
  return pausado;
}

export function getTamanhoFila(): number {
  return fila.length;
}
