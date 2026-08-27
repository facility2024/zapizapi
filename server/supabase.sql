-- ============================================================
-- Zapizapi — schema para Supabase (PostgreSQL)
-- Execute este script no SQL Editor do Supabase:
--   https://app.supabase.com -> projeto -> SQL -> New query -> colar e Run
-- O app se conecta via Prisma usando a DATABASE_URL do Supabase.
-- ============================================================

-- Garante geração de UUID (já habilitado por padrão no Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tabela: Contato
CREATE TABLE IF NOT EXISTS "Contato" (
  "id" text NOT NULL,
  "numero" text NOT NULL,
  "nome" text,
  "empresa" text,
  "cidade" text,
  "extras" text NOT NULL DEFAULT '{}',
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "Contato_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Contato_numero_key" ON "Contato"("numero");

-- Tabela: Campanha
CREATE TABLE IF NOT EXISTS "Campanha" (
  "id" text NOT NULL,
  "nome" text NOT NULL,
  "tipoDisparo" text NOT NULL,
  "textoMensagem" text NOT NULL,
  "imagemUrl" text,
  "audioUrl" text,
  "variavelFallback" text,
  "status" text NOT NULL DEFAULT 'rascunho',
  "agendarPara" timestamp(3),
  "totalContatos" integer NOT NULL DEFAULT 0,
  "enviados" integer NOT NULL DEFAULT 0,
  "erros" integer NOT NULL DEFAULT 0,
  "delayEntreMsgMin" integer NOT NULL DEFAULT 20,
  "delayEntreMsgMax" integer NOT NULL DEFAULT 40,
  "delayImagemTexto" integer NOT NULL DEFAULT 4,
  "limitePorHora" integer,
  "limitePorDia" integer,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "Campanha_pkey" PRIMARY KEY ("id")
);

-- Tabela: CampanhaContato (liga campanhas e contatos)
CREATE TABLE IF NOT EXISTS "CampanhaContato" (
  "id" text NOT NULL,
  "campanhaId" text NOT NULL,
  "contatoId" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pendente',
  "errorMsg" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "enviadoEm" timestamp(3),
  CONSTRAINT "CampanhaContato_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CampanhaContato_campanhaId_contatoId_key" UNIQUE ("campanhaId", "contatoId"),
  CONSTRAINT "CampanhaContato_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "Campanha"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CampanhaContato_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "Contato"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CampanhaContato_campanhaId_idx" ON "CampanhaContato"("campanhaId");
CREATE INDEX IF NOT EXISTS "CampanhaContato_contatoId_idx" ON "CampanhaContato"("contatoId");

-- Tabela: Envio (histórico de envios)
CREATE TABLE IF NOT EXISTS "Envio" (
  "id" text NOT NULL,
  "campanhaId" text NOT NULL,
  "contatoId" text NOT NULL,
  "tipo" text NOT NULL,
  "status" text NOT NULL,
  "response" text,
  "errorMsg" text,
  "enviadoEm" timestamp(3) NOT NULL DEFAULT now(),
  CONSTRAINT "Envio_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Envio_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "Campanha"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Envio_campanhaId_idx" ON "Envio"("campanhaId");
CREATE INDEX IF NOT EXISTS "Envio_contatoId_idx" ON "Envio"("contatoId");

-- Tabela: ConfiguracaoDelay (configurações de delay)
CREATE TABLE IF NOT EXISTS "ConfiguracaoDelay" (
  "id" text NOT NULL,
  "chave" text NOT NULL,
  "valor" text NOT NULL,
  "descricao" text,
  CONSTRAINT "ConfiguracaoDelay_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConfiguracaoDelay_chave_key" UNIQUE ("chave")
);

-- Trigger: mantém "updatedAt" da Campanha atualizado (Prisma também gerencia)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Campanha_updatedAt" ON "Campanha";
CREATE TRIGGER "Campanha_updatedAt" BEFORE UPDATE ON "Campanha"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Permissões: o app usa a chave anon (pública) e o RLS das tabelas acima está desligado,
-- então concedemos acesso completo à role anon para o app funcionar via Data API.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
