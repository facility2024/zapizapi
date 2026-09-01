/**
 * emailService.ts
 * Envio automático via SMTP Hostinger (smtp.hostinger.com:465 SSL)
 * Remetente e destinatário: suporte@coconudi.com
 * Senha lida exclusivamente de SMTP_PASSWORD (nunca hardcode)
 */

import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.hostinger.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || "suporte@coconudi.com";
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || "";
// Destinatário fixo conforme requisito
const NOTIFY_TO = process.env.NOTIFY_TO || "suporte@coconudi.com";

interface NotificacaoPayload {
  nome: string;
  email: string;
  mensagem: string;
  data?: string; // ISO string; se não vier, usa agora
  origem?: string; // ex: "cadastro" | "contato" | "formulario"
}

function validarPayload(d: NotificacaoPayload): string | null {
  if (!d.nome || d.nome.trim().length < 2) return "Nome é obrigatório (mín. 2 caracteres)";
  if (!d.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return "E-mail inválido";
  if (!d.mensagem || d.mensagem.trim().length < 2) return "Mensagem é obrigatória";
  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function criarTransporter() {
  if (!SMTP_PASSWORD) {
    throw new Error("SMTP_PASSWORD não configurado. Defina SMTP_PASSWORD no .env (nunca commitar).");
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // SSL/TLS em 465
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
  });
}

/**
 * Envia notificação para suporte@coconudi.com.
 * Só retorna sucesso após confirmação do servidor SMTP.
 * Em falha, lança erro com mensagem real do SMTP.
 */
export async function enviarNotificacao(payload: NotificacaoPayload): Promise<{ messageId: string }> {
  const erroValidacao = validarPayload(payload);
  if (erroValidacao) throw new Error(erroValidacao);

  const dataFmt = payload.data
    ? new Date(payload.data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const transporter = criarTransporter();

  const subject = payload.origem
    ? `[coconudi.com] Nova ${payload.origem}: ${payload.nome}`
    : `[coconudi.com] Novo contato: ${payload.nome}`;

  const text = [
    `Nova notificação do site coconudi.com`,
    ``,
    `Nome: ${payload.nome}`,
    `E-mail: ${payload.email}`,
    `Data: ${dataFmt}`,
    `Origem: ${payload.origem || "formulario"}`,
    ``,
    `Mensagem:`,
    payload.mensagem,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px">
      <h2 style="color:#111">Nova notificação — coconudi.com</h2>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse">
        <tr><td><strong>Nome</strong></td><td>${escapeHtml(payload.nome)}</td></tr>
        <tr><td><strong>E-mail</strong></td><td>${escapeHtml(payload.email)}</td></tr>
        <tr><td><strong>Data</strong></td><td>${escapeHtml(dataFmt)}</td></tr>
        <tr><td><strong>Origem</strong></td><td>${escapeHtml(payload.origem || "formulario")}</td></tr>
      </table>
      <p><strong>Mensagem:</strong></p>
      <div style="white-space:pre-wrap;background:#f6f6f6;padding:12px;border-radius:8px">${escapeHtml(payload.mensagem)}</div>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: SMTP_USER, // remetente = suporte@coconudi.com
      to: NOTIFY_TO, // destinatário = suporte@coconudi.com
      replyTo: payload.email, // facilita responder ao usuário
      subject,
      text,
      html,
    });
    // Só chegou aqui se SMTP confirmou
    return { messageId: info.messageId };
  } catch (err: unknown) {
    // Mostra erro real do SMTP no backend
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SMTP] Falha ao enviar e-mail:", msg, err);
    throw new Error(`Falha SMTP: ${msg}`);
  }
}

/**
 * Verifica conexão SMTP (usado no teste)
 */
export async function verificarConexaoSMTP(): Promise<void> {
  const transporter = criarTransporter();
  await transporter.verify();
}
