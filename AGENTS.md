# AGENTS.md

## Projeto

Zapizapi — app de disparo e agendamento de mensagens WhatsApp via W-API (wapi.chat).

## Comandos

```bash
# Instalar dependências (raiz + server + client)
npm install && cd server && npm install && cd ../client && npm install

# Rodar tudo (server + client simultâneo)
npm run dev

# Só o server (porta 3001)
cd server && npm run dev

# Só o client (porta 5173)
cd server && npm run dev

# Gerar cliente Prisma
cd server && npx prisma generate

# Push do schema para SQLite
cd server && npx prisma db push
```

## Variáveis de Ambiente

Copie `server/.env.example` para `server/.env` e preencha:
- `WAPI_INSTANCE_ID` — ID da instância W-API
- `WAPI_TOKEN` — Token de autenticação
- `WAPI_BASE_URL` — URL base (padrão: https://api.wapi.chat)

Nunca commite o `.env`.

## Arquitetura

- **Monorepo**: `server/` (Express + Prisma + SQLite) e `client/` (React + Vite + Tailwind)
- **Fila**: em memória com persistência via Prisma (não usa Redis no MVP)
- **WebSocket**: socket.io atualiza dashboard em tempo real
- **Proxy**: Vite roteia `/api` e `/uploads` para `localhost:3001`

## Convenções

- Código comentado em português
- Services isolados e testáveis: `messageParser.ts`, `wapiClient.ts`, `queue.ts`, `excelParser.ts`, `audioConverter.ts`
- Schema Prisma com SQLite, pronto para migrar a Postgres
- Spintax usa sintaxe `{op1|op2|op3}` — parseado DEPOIS de resolver variáveis `{{var}}`
- Delay entre envios é aleatório dentro de range configurável (não fixo)
- Tema visual: fundo #0A0A0A, accent #8B00FF/#A100FF

## Gotchas

- `fluent-ffmpeg` requer `ffmpeg` instalado no sistema para converter áudio
- W-API não oficial — payloads podem mudar; consultar docs antes de alterar `wapiClient.ts`
- Planilha deve ter coluna de número (aliases: numero, telefone, whatsapp, phone)
- Números são normalizados com DDI 55 automaticamente
