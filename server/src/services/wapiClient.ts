/**
 * wapiClient.ts
 * Cliente para comunicação com a W-API (w-api.app)
 */

import axios, { AxiosInstance } from "axios";

const WAPI_BASE_URL = process.env.WAPI_BASE_URL || "https://api.w-api.app/v1";
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

/**
 * Verifica se a instância está conectada
 * Tenta o endpoint connection-state; se falhar, assume desconectado
 */
export async function checkStatus(): Promise<ConnectionStatus> {
  try {
    const client = getClient();
    const { data } = await client.get(`/instance/connection-state?instanceId=${WAPI_INSTANCE_ID}`);
    return {
      status: data.state === "open" || data.connected === true ? "connected" : data.state === "connecting" ? "connecting" : "disconnected",
    };
  } catch {
    return { status: "disconnected" };
  }
}

/**
 * Obtém QR Code para pareamento
 */
export async function getQrCode(): Promise<QrCodeResponse> {
  try {
    const client = getClient();
    const { data } = await client.get(`/instance/connect-qrcode-base64?instanceId=${WAPI_INSTANCE_ID}`);
    return {
      qrCode: data.qrCode || data.base64 || data.qr,
      base64: data.base64 || data.qrCode || data.qr,
    };
  } catch (err: unknown) {
    const error = err as { response?: { data?: { message?: string } }; message?: string };
    throw new Error(error.response?.data?.message || error.message || "Erro ao obter QR Code");
  }
}

/**
 * Conecta a instância
 */
export async function connect(): Promise<void> {
  try {
    const client = getClient();
    await client.post(`/instance/connect?instanceId=${WAPI_INSTANCE_ID}`);
  } catch {
    // Silencia erros de conexão
  }
}

/**
 * Envia texto simples
 * POST https://api.w-api.app/v1/message/send-text?instanceId=INSTANCE_ID
 */
export async function sendText(numero: string, texto: string): Promise<WapiResponse> {
  try {
    const client = getClient();
    const { data } = await client.post(`/message/send-text?instanceId=${WAPI_INSTANCE_ID}`, {
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
 */
export async function sendImage(numero: string, imageUrl: string, caption?: string): Promise<WapiResponse> {
  try {
    const client = getClient();
    const { data } = await client.post(`/message/send-image?instanceId=${WAPI_INSTANCE_ID}`, {
      phone: numero,
      mediatype: "image",
      media: imageUrl,
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
 */
export async function sendAudio(numero: string, audioUrl: string): Promise<WapiResponse> {
  try {
    const client = getClient();
    const { data } = await client.post(`/message/send-audio?instanceId=${WAPI_INSTANCE_ID}`, {
      phone: numero,
      mediatype: "audio",
      media: audioUrl,
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
 * A W-API aplica composing automaticamente via delayMessage
 */
export async function setComposing(_numero: string, _durationMs: number): Promise<void> {
  // Não há endpoint dedicado de composing na W-API
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
