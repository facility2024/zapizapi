/**
 * queue.ts
 * Motor de fila de envio com delay configurável e persistência via Prisma
 */

import { Campanha, CampanhaContato, Contato } from "@prisma/client";
import * as wapi from "./wapiClient.js";
import { processarMensagem, Contato as MessageContato } from "./messageParser.js";
import { prisma } from "../db.js";

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
let statusCallback: StatusCallback | null = null;

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
 * Extrai a lista de URLs de imagens da campanha (até 4).
 * Aceita o novo campo imagensUrls (JSON array) ou o legado imagemUrl (único).
 */
function obterImagens(imagensUrls?: string | null, imagemUrl?: string | null): string[] {
  if (imagensUrls) {
    try {
      const arr = JSON.parse(imagensUrls);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.filter((u: unknown): u is string => typeof u === "string" && !!u).slice(0, 4);
      }
    } catch {
      // ignora JSON inválido
    }
  }
  if (imagemUrl) return [imagemUrl];
  return [];
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
 * Processa a fila de envio
 */
export async function processarFila(): Promise<void> {
  if (processando || fila.length === 0) return;
  processando = true;

  console.log(`[FILA] Iniciando processamento com ${fila.length} contatos na fila`);

  // Delay inicial antes do primeiro envio (10-20s para "aquecer")
  const delayInicial = randomDelay(10, 20);
  console.log(`[FILA] Aguardando ${Math.round(delayInicial / 1000)}s antes do primeiro envio...`);
  await new Promise((r) => setTimeout(r, delayInicial));

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
      const temNome = contato.nome && contato.nome.trim().length > 0;
      console.log(`[FILA] Processando ${numero} (nome: ${temNome ? contato.nome : 'sem nome'})`);

      // Simula digitação (tempo realista)
      const tempoDig = wapi.calcularTempoDigitação(campanha.textoMensagem);
      await wapi.setComposing(numero, tempoDig);

      // Processa mensagem com variáveis do contato
      const msg = processarMensagem(
        campanha.textoMensagem,
        contato as unknown as MessageContato,
        campanha.variavelFallback || undefined
      );
      console.log(`[FILA] Mensagem processada para ${numero}: "${msg.substring(0, 50)}..."`);

      // Envia conforme o tipo
      if (campanha.tipoDisparo === "texto") {
        const resultado = await wapi.sendText(numero, msg);
        if (!resultado.success) throw new Error(resultado.error);
        await registrarEnvio(campanhaId, contatoId, "texto", resultado);

      } else if (campanha.tipoDisparo === "imagem_texto") {
        // Envia até 4 imagens (cada uma como mensagem separada, legenda só na 1ª)
        const urls = obterImagens(campanha.imagensUrls, campanha.imagemUrl);
        if (urls.length === 0) throw new Error("Nenhuma imagem configurada na campanha");
        for (let i = 0; i < urls.length; i++) {
          await wapi.setComposing(numero, wapi.calcularTempoDigitação(msg));
          const resImg = await wapi.sendImage(numero, urls[i], msg);
          if (!resImg.success) throw new Error(resImg.error);
          await registrarEnvio(campanhaId, contatoId, "imagem", resImg);
          if (i < urls.length - 1) await new Promise((r) => setTimeout(r, 1500));
        }

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
      wapi.marcarConectado();
      notify(campanhaId, contatoId, "enviado");
      console.log(`[FILA] ✅ Mensagem enviada para ${numero}`);

    } catch (err: unknown) {
      const erro = err instanceof Error ? err.message : "Erro desconhecido";
      console.error(`[FILA] ❌ Erro ao enviar para ${contato.numero}: ${erro}`);
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

    // Delay aleatório entre envios (respeita configuração do usuário)
    if (fila.length > 0 && !cancelado) {
      const delay = randomDelay(campanha.delayEntreMsgMin, campanha.delayEntreMsgMax);
      console.log(`[FILA] Aguardando ${Math.round(delay / 1000)}s antes do próximo envio...`);
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
    console.log(`[FILA] Campanha ${campanhaAtualId} concluída`);
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
