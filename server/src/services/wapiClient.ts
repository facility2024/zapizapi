/**
 * wapiClient.ts
 * Cliente para comunicação com a W-API (w-api.app)
 */

import axios, { AxiosInstance } from "axios";

const WAPI_BASE_URL = process.env.WAPI_BASE_URL || "https://api.w-api.app";
const WAPI_INSTANCE_ID = process.env.WAPI_INSTANCE_ID || "";
const WAPI_TOKEN = process.env.WAPI_TOKEN || "";

interface WapiResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

interface QrCodeResponse {
  qrCode: string;
  base64: string;
}

interface ConnectionStatus {
  status: "connected" | "disconnected" | "connecting";
}

let api: AxiosInstance | null = null;

function getClient(): AxiosInstance {
  if (!api) {
    api = axios.create({
      baseURL: WAPI_BASE_URL,
      headers: {
        Authorization: `Bearer ${WAPI_TOKEN}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }
  return api;
}

// Estado da conexão no servidor — W-API status-instance é instável
let estadoConexao = { conectado: false, ultimaVerificacaoOk: 0 };

export function marcarConectado(): void {
  estadoConexao.conectado = true;
  estadoConexao.ultimaVerificacaoOk = Date.now();
}

export function marcarDesconectado(): void {
  estadoConexao.conectado = false;
}

/**
 * Verifica se a instância está conectada
 * Combina: estado interno + status-instance + fetch-instance
 */
export async function checkStatus(): Promise<ConnectionStatus> {
  try {
    const client = getClient();

    // Tenta status-instance (rápido)
    const { data } = await client.get(`/v1/instance/status-instance?instanceId=${WAPI_INSTANCE_ID}`);
    if (data.connected === true) {
      marcarConectado();
      return { status: "connected" };
    }

    // Tenta fetch-instance
    try {
      const { data: fetchData } = await client.get(`/v1/instance/fetch-instance?instanceId=${WAPI_INSTANCE_ID}`);
      if (fetchData.connected === true || (fetchData.connectedPhone && fetchData.connectedPhone.length > 0)) {
        marcarConectado();
        return { status: "connected" };
      }
    } catch {
      // Ignora
    }

    // Se W-API diz desconectado, mas marcamos como conectado nos últimos 5 minutos,
    // confia no estado interno (W-API é instável)
    const TEMPO_MAX_CACHE_MS = 5 * 60 * 1000;
    if (estadoConexao.conectado && Date.now() - estadoConexao.ultimaVerificacaoOk < TEMPO_MAX_CACHE_MS) {
      return { status: "connected" };
    }

    return { status: "disconnected" };
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown }; message?: string };
    console.error("[WAPI] Erro ao verificar status:", error.response?.data || error.message);
    return { status: "disconnected" };
  }
}

/**
 * Força verificação ignorando cache interno
 */
export async function forceCheckStatus(): Promise<ConnectionStatus> {
  estadoConexao.conectado = false;
  return checkStatus();
}

export function getCachedStatus(): ConnectionStatus {
  const TEMPO_MAX_CACHE_MS = 5 * 60 * 1000;
  if (estadoConexao.conectado && Date.now() - estadoConexao.ultimaVerificacaoOk < TEMPO_MAX_CACHE_MS) {
    return { status: "connected" };
  }
  return { status: "disconnected" };
}

/**
 * Obtém QR Code para pareamento
 * GET /v1/instance/qr-code?instanceId=X
 */
export async function getQrCode(): Promise<QrCodeResponse> {
  const client = getClient();
  try {
    const { data } = await client.get(`/v1/instance/qr-code?instanceId=${WAPI_INSTANCE_ID}`);
    // W-API retorna { error, instanceId, qrcode: "data:image/png;base64,..." }
    const qr = data.qrcode || data.qrCode || data.base64 || "";
    if (!qr) throw new Error("W-API retornou QR Code vazio");
    return {
      qrCode: qr,
      base64: qr,
    };
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown }; message?: string };
    console.error("[WAPI] Erro ao obter QR Code:", error.response?.data || error.message);
    throw new Error(`Falha ao obter QR Code: ${error.response?.data ? JSON.stringify(error.response.data) : error.message}`);
  }
}

/**
 * Reinicia a instância
 * GET /v1/instance/restart?instanceId=X
 */
export async function restartInstance(): Promise<void> {
  const client = getClient();
  await client.get(`/v1/instance/restart?instanceId=${WAPI_INSTANCE_ID}`);
}

/**
 * Envia texto simples
 * POST /v1/message/send-text?instanceId=X
 */
export async function sendText(numero: string, texto: string): Promise<WapiResponse> {
  try {
    const client = getClient();
    const { data } = await client.post(`/v1/message/send-text?instanceId=${WAPI_INSTANCE_ID}`, {
      phone: numero,
      message: texto,
    });
    return { success: true, data };
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } }; message?: string };
    return {
      success: false,
      error: error.response?.data?.message || error.message || "Erro ao enviar texto",
    };
  }
}

/**
 * Envia imagem com legenda
 * POST /v1/message/send-image?instanceId=X
 */
export async function sendImage(numero: string, imageUrl: string, caption?: string): Promise<WapiResponse> {
  try {
    const client = getClient();
    const { data } = await client.post(`/v1/message/send-image?instanceId=${WAPI_INSTANCE_ID}`, {
      phone: numero,
      image: imageUrl,
      caption: caption || "",
    });
    return { success: true, data };
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } }; message?: string };
    return {
      success: false,
      error: error.response?.data?.message || error.message || "Erro ao enviar imagem",
    };
  }
}

/**
 * Envia áudio como nota de voz (ptt)
 * POST /v1/message/send-audio?instanceId=X
 */
export async function sendAudio(numero: string, audioUrl: string): Promise<WapiResponse> {
  try {
    const client = getClient();
    const { data } = await client.post(`/v1/message/send-audio?instanceId=${WAPI_INSTANCE_ID}`, {
      phone: numero,
      audio: audioUrl,
      ptt: true,
    });
    return { success: true, data };
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } }; message?: string };
    return {
      success: false,
      error: error.response?.data?.message || error.message || "Erro ao enviar áudio",
    };
  }
}

/**
 * Envia presença (digitando/paused)
 * POST /v1/chats/send-presence?instanceId=X
 */
export async function setComposing(numero: string, durationMs: number): Promise<void> {
  try {
    const client = getClient();
    await client.post(`/v1/chats/send-presence?instanceId=${WAPI_INSTANCE_ID}`, {
      phone: numero,
      presence: "composing",
      delay: Math.floor(durationMs / 1000),
    });
  } catch {
    // Silencia erros de composing
  }
}

/**
 * Calcula tempo de digitação baseado no tamanho do texto
 */
export function calcularTempoDigitação(texto: string): number {
  const msPorChar = 50;
  const min = 1500;
  const max = 6000;
  const calculado = texto.length * msPorChar;
  return Math.max(min, Math.min(max, calculado));
}
