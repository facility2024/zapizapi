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
cd client && npm run dev

# Gerar cliente Prisma
cd server && npx prisma generate

# Push do schema para SQLite
cd server && npx prisma db push
```

## Variáveis de Ambiente

Copie `server/.env.example` para `server/.env` e preencha:
- `WAPI_INSTANCE_ID` — ID da instância W-API
- `WAPI_TOKEN` — Token de autenticação
- `WAPI_BASE_URL` — URL base (padrão no `.env.example`: https://api.w-api.app)

Nunca commite o `.env`.

## Arquitetura

- **Monorepo**: `server/` (Express + Prisma + SQLite local) e `client/` (React + Vite + Tailwind)
- **Banco**: Prisma + SQLite local (`file:./dev.db`, criado via `npx prisma db push`). `server/supabase.sql` é espelho para quem quiser usar Supabase na nuvem (o projeto atual está bloqueado por `exceed_db_size_quota`).
- **Fila**: em memória com persistência via Prisma (não usa Redis no MVP)
- **WebSocket**: socket.io atualiza dashboard em tempo real
- **Proxy**: Vite roteia `/api` e `/uploads` para `localhost:3001`

## Convenções

- Código comentado em português
- Services isolados e testáveis: `messageParser.ts`, `wapiClient.ts`, `queue.ts`, `excelParser.ts`, `audioConverter.ts`
- Schema Prisma com SQLite local (`file:./dev.db`). `npx prisma generate` + `npx prisma db push` recriam o banco. Para nuvem, use `server/supabase.sql` (camelCase) num projeto Supabase com cota ok.
- Spintax usa sintaxe `{op1|op2|op3}` — parseado DEPOIS de resolver variáveis `{{var}}`
- Variáveis de saudação (`messageParser.ts`): `{{ola}}` é dinâmico (Bom dia/Boa tarde/Boa noite pelo horário do envio); `{{bom_dia}}`, `{{boa_tarde}}`, `{{boa_noite}}` são textos fixos. `{{numero}}`, `{{nome}}`, `{{empresa}}`, `{{cidade}}` e qualquer coluna extra da planilha também funcionam.
- Delay entre envios é aleatório dentro de range configurável (não fixo)
- Tema visual: fundo #0A0A0A, accent #8B00FF/#A100FF

## Gotchas

- `fluent-ffmpeg` requer `ffmpeg` instalado no sistema para converter áudio
- W-API não oficial — payloads podem mudar; consultar docs antes de alterar `wapiClient.ts`
- Planilha deve ter coluna de número (aliases: numero, telefone, whatsapp, phone)
- Números são normalizados com DDI 55 automaticamente

## Deploy (Easypanel / Docker)

O app roda como **um único serviço**: o Express serve a API (`:3001`) e também o frontend buildado (`client/dist`). Não precisa de dois serviços nem proxy.

1. No Easypanel, crie um serviço **Node.js** apontando para este repo.
2. **Build command**: `npx prisma generate && npx prisma db push && npm run build`
3. **Start command**: `npm start` (sobe o server via `tsx`, que já serve o client)
4. **Porta**: expõe a `PORT` (padrão 3001).
5. **Variáveis de ambiente** (igual ao `.env.example`): `WAPI_INSTANCE_ID`, `WAPI_TOKEN`, `WAPI_BASE_URL`, `DATABASE_URL="file:./dev.db"`, `PORT`.
6. **Banco persistente**: o SQLite grava em `server/prisma/dev.db`. Monte um **volume persistente** nesse caminho (ou em `server/prisma`) para não perder os dados ao reiniciar o container. Para usar Postgres/Supabase na nuvem, troque `DATABASE_URL` e adapte o `db.ts`/`schema.prisma` (espelho em `server/supabase.sql`).
