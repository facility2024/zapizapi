/**
 * notificacao.ts
 * Rota para notificar suporte@coconudi.com sempre que houver
 * cadastro ou mensagem pelo site.
 * Valida dados antes do envio e só responde sucesso após confirmação SMTP.
 */

import { Router } from "express";
import { enviarNotificacao } from "../services/emailService.js";

const router = Router();

/**
 * POST /api/notificacao
 * Body: { nome, email, mensagem, data?, origem? }
 * origem: "cadastro" | "contato" | "mensagem" | "formulario" (opcional)
 */
router.post("/", async (req, res) => {
  const { nome, email, mensagem, data, origem } = req.body || {};

  // Validação explícita (também validada no service)
  if (!nome || typeof nome !== "string" || nome.trim().length < 2) {
    res.status(400).json({ error: "Nome é obrigatório (mín. 2 caracteres)" });
    return;
  }
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "E-mail inválido" });
    return;
  }
  if (!mensagem || typeof mensagem !== "string" || mensagem.trim().length < 2) {
    res.status(400).json({ error: "Mensagem é obrigatória" });
    return;
  }

  try {
    const result = await enviarNotificacao({
      nome: nome.trim(),
      email: email.trim(),
      mensagem: mensagem.trim(),
      data: data ? String(data) : undefined,
      origem: origem ? String(origem) : "formulario",
    });

    // Só informa sucesso depois da confirmação SMTP (messageId existe)
    res.json({ success: true, message: "E-mail enviado com sucesso", messageId: result.messageId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido ao enviar e-mail";
    console.error("[NOTIFICACAO] Erro:", msg);
    // Mostra erro real no backend (log acima) e retorna erro legível sem expor senha
    res.status(502).json({ error: msg });
  }
});

/**
 * POST /api/notificacao/cadastro
 * Atalho semântico para cadastro — mesmo comportamento, origem = "cadastro"
 */
router.post("/cadastro", async (req, res) => {
  req.body.origem = "cadastro";
  // delega para handler acima reutilizando lógica — chama diretamente
  const { nome, email, mensagem, data } = req.body || {};
  if (!nome || !email || !mensagem) {
    res.status(400).json({ error: "nome, email e mensagem são obrigatórios" });
    return;
  }
  try {
    const result = await enviarNotificacao({
      nome: String(nome).trim(),
      email: String(email).trim(),
      mensagem: String(mensagem).trim(),
      data: data ? String(data) : undefined,
      origem: "cadastro",
    });
    res.json({ success: true, message: "E-mail enviado com sucesso", messageId: result.messageId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[NOTIFICACAO/cadastro] Erro:", msg);
    res.status(502).json({ error: msg });
  }
});

/**
 * POST /api/notificacao/contato
 * Atalho semântico para mensagem de contato — origem = "contato"
 */
router.post("/contato", async (req, res) => {
  const { nome, email, mensagem, data } = req.body || {};
  if (!nome || !email || !mensagem) {
    res.status(400).json({ error: "nome, email e mensagem são obrigatórios" });
    return;
  }
  try {
    const result = await enviarNotificacao({
      nome: String(nome).trim(),
      email: String(email).trim(),
      mensagem: String(mensagem).trim(),
      data: data ? String(data) : undefined,
      origem: "contato",
    });
    res.json({ success: true, message: "E-mail enviado com sucesso", messageId: result.messageId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[NOTIFICACAO/contato] Erro:", msg);
    res.status(502).json({ error: msg });
  }
});

export default router;
