/**
 * wapiClient.ts
 * Cliente para comunicação com a W-API (wapi.chat)
 */

import axios, { AxiosInstance } from "axios";

const WAPI_BASE_URL = process.env.WAPI_BASE_URL || "https://api.wapi.chat";
const WAPI_INSTANCE_ID = process.env.WAPI_INSTANCE_ID || "";
const WAPI_TOKEN = process.env.WAPI_TOKEN || "";

interface WapiConfig {
  baseUrl: string;
  instanceId: string;
  token: string;
}

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

function getInstanceUrl(): string {
  return `/instance/${WAPI_INSTANCE_ID}`;
}

/**
 * Verifica se a instância está conectada
 */
export async function checkStatus(): Promise<ConnectionStatus> {
  try {
    const client = getClient();
    const { data } = await client.get(`${getInstanceUrl()}/status`);
    return {
      status: data.state === "open" ? "connected" : data.state === "connecting" ? "connecting" : "disconnected",
    };
  } catch {
    return { status: "disconnected" };
  }
}

/**
 * Obtém QR Code para pareamento
 */
export async function getQrCode(): Promise<QrCodeResponse> {
  const client = getClient();
  const { data } = await client.get(`${getInstanceUrl()}/qr`);
  return {
    qrCode: data.qr || data.base64,
    base64: data.base64 || data.qr,
  };
}

/**
 * Envia texto simples
 */
export async function sendText(numero: string, texto: string): Promise<WapiResponse> {
  try {
    const client = getClient();
    const { data } = await client.post(`${getInstanceUrl()}/send-text`, {
      number: numero,
      text: texto,
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
    const { data } = await client.post(`${getInstanceUrl()}/send-image`, {
      number: numero,
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
 */
export async function sendAudio(numero: string, audioUrl: string): Promise<WapiResponse> {
  try {
    const client = getClient();
    const { data } = await client.post(`${getInstanceUrl()}/send-voice`, {
      number: numero,
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
 * Simula digitação (composing)
 */
export async function setComposing(numero: string, durationMs: number): Promise<void> {
  try {
    const client = getClient();
    await client.post(`${getInstanceUrl()}/send-presence`, {
      number: numero,
      presence: "composing",
    });
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    await client.post(`${getInstanceUrl()}/send-presence`, {
      number: numero,
      presence: "paused",
    });
  } catch {
    // Silencia erros de composing — não deve bloquear envio
  }
}

/**
 * Calcula tempo de digitação baseado no tamanho do texto
 */
export function calcularTempoDigitação(texto: string): number {
  const msPorChar = 50; // 50ms por caractere
  const min = 1500;     // mínimo 1.5s
  const max = 6000;     // máximo 6s
  const calculado = texto.length * msPorChar;
  return Math.max(min, Math.min(max, calculado));
}
