FROM node:20-alpine

# ffmpeg é necessário para conversão de áudio (fluent-ffmpeg)
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Recebe as variáveis como build-arg e as repassa como ENV (disponíveis em runtime)
ARG WAPI_INSTANCE_ID
ARG WAPI_TOKEN
ARG WAPI_BASE_URL
ARG DATABASE_URL
ARG PORT

ENV WAPI_INSTANCE_ID=$WAPI_INSTANCE_ID
ENV WAPI_TOKEN=$WAPI_TOKEN
ENV WAPI_BASE_URL=${WAPI_BASE_URL:-https://api.w-api.app}
ENV DATABASE_URL=${DATABASE_URL:-file:/app/data/dev.db}
ENV PORT=${PORT:-3001}

# Garante os diretórios de banco e uploads
RUN mkdir -p /app/data server/uploads

# Instala dependências (raiz, server e client)
COPY package*.json ./
RUN npm install
COPY server/package*.json ./server/
RUN cd server && npm install
COPY client/package*.json ./client/
RUN cd client && npm install

# Código-fonte
COPY . .

# Gera o client Prisma e builda o frontend (client/dist)
RUN cd server && npx prisma generate
RUN npm run build

EXPOSE 3001

# Cria o banco SQLite (se não existir) e sobe o servidor (API + frontend na mesma porta)
CMD ["sh", "-c", "cd server && npx prisma db push && npm start"]
