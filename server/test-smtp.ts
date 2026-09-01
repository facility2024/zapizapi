/**
 * test-smtp.ts
 * Teste de envio SMTP Hostinger
 *
 * Como executar:
 *   1. Configure server/.env com SMTP_PASSWORD real (nunca commitar)
 *      SMTP_HOST=smtp.hostinger.com
 *      SMTP_PORT=465
 *      SMTP_USER=suporte@coconudi.com
 *      SMTP_PASSWORD=sua_senha_real
 *      NOTIFY_TO=suporte@coconudi.com
 *   2. Rode:  cd server && npx tsx test-smtp.ts
 *   3. Verifique a caixa suporte@coconudi.com
 *
 * O script valida variáveis, verifica conexão e envia e-mail de teste.
 * Só imprime "enviado com sucesso" após confirmação do servidor SMTP.
 * Em falha, mostra erro real do SMTP.
 */
import "dotenv/config";
import { enviarNotificacao, verificarConexaoSMTP } from "./src/services/emailService.js";

async function main() {
  console.log("=== Teste SMTP Hostinger ===");
  console.log(`Host: ${process.env.SMTP_HOST || "smtp.hostinger.com"}:${process.env.SMTP_PORT || 465}`);
  console.log(`User: ${process.env.SMTP_USER || "suporte@coconudi.com"}`);
  console.log(`To  : ${process.env.NOTIFY_TO || "suporte@coconudi.com"}`);
  if (!process.env.SMTP_PASSWORD) {
    console.error("ERRO: SMTP_PASSWORD não definido no .env");
    process.exit(1);
  }

  try {
    console.log("\n[1/2] Verificando conexão SMTP...");
    await verificarConexaoSMTP();
    console.log("Conexão SMTP OK");
  } catch (e: unknown) {
    console.error("Falha na verificação SMTP:", e instanceof Error ? e.message : e);
    process.exit(1);
  }

  try {
    console.log("\n[2/2] Enviando e-mail de teste...");
    const res = await enviarNotificacao({
      nome: "Teste Coconudi",
      email: "teste@coconudi.com",
      mensagem: "Este é um teste automático de envio SMTP via Hostinger. Se você recebeu, a configuração está correta.",
      origem: "teste-smtp",
    });
    console.log(`✓ Enviado com sucesso! messageId=${res.messageId}`);
    console.log("Verifique a caixa suporte@coconudi.com");
  } catch (e: unknown) {
    console.error("Falha ao enviar e-mail:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();
