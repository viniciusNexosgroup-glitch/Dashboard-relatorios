# Dashboard de Tráfego Pago

Sistema completo para agências de tráfego pago gerenciarem relatórios de Meta Ads e Google Ads, com envio automático via WhatsApp.

## Stack

- **Frontend/Backend:** Next.js 14 (App Router) + TypeScript
- **Banco de dados:** PostgreSQL via Supabase + Prisma ORM
- **Autenticação:** NextAuth.js
- **Gráficos:** Recharts
- **PDF:** @react-pdf/renderer
- **WhatsApp:** Evolution API
- **Estilo:** Tailwind CSS

## Configuração Inicial

### 1. Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

Preencha no mínimo:
- `DATABASE_URL` — URL do Supabase PostgreSQL
- `NEXTAUTH_SECRET` — gere com `openssl rand -base64 32`
- `NEXTAUTH_URL` — URL do sistema (ex: http://localhost:3000)
- `CRON_SECRET` — string aleatória para proteger os endpoints de cron

### 2. Banco de dados

```bash
# Criar tabelas no banco
npm run db:push

# Criar usuário admin inicial
npm run db:seed
```

Login inicial: `admin@agencia.com` / `admin123`

### 3. Rodar o projeto

```bash
npm run dev
```

Acesse http://localhost:3000

---

## Configuração das APIs

### Meta Ads

1. Acesse https://developers.facebook.com/
2. Crie um App com permissões `ads_read` e `ads_management`
3. Gere um token de longa duração (60 dias)
4. No sistema: **Clientes → Vincular conta → Meta Ads**

### Google Ads

1. Acesse https://console.cloud.google.com/
2. Crie credenciais OAuth2 para aplicação web
3. Solicite um Developer Token em https://ads.google.com/home/tools/manager-accounts/
4. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DEVELOPER_TOKEN` no `.env`
5. Use o fluxo OAuth para gerar o `refreshToken` por cliente

### Evolution API (WhatsApp)

1. Instale o Evolution API em um servidor
2. Configure `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCE_NAME`
3. Conecte sua instância via QR Code no painel do Evolution API
4. Cadastre o ID do grupo de WhatsApp em cada cliente

---

## Cron Jobs (Automação)

Configure um serviço externo para chamar:

| Horário | Endpoint | Descrição |
|---------|----------|-----------|
| 08:00, 14:00, 20:00 | `GET /api/cron/sync` | Sincroniza métricas |
| Dia 1 do mês, 08:00 | `GET /api/cron/monthly-report` | Envia relatório mensal |

Com header: `Authorization: Bearer <CRON_SECRET>`

Serviços gratuitos: EasyCron, cron-job.org, Vercel Cron (em produção no Vercel)

---

## Estrutura do Projeto

```
app/
├── (auth)/login/          # Tela de login
├── (dashboard)/
│   ├── dashboard/         # Dashboard principal
│   ├── clientes/          # Gestão de clientes
│   ├── relatorios/        # Histórico de relatórios
│   └── configuracoes/     # Status das integrações
├── api/
│   ├── auth/              # NextAuth
│   ├── clients/           # CRUD de clientes
│   ├── ad-accounts/       # Vinculação de contas
│   ├── metrics/           # Métricas agregadas
│   ├── meta-ads/sync/     # Sync Meta Ads
│   ├── google-ads/sync/   # Sync Google Ads
│   ├── reports/generate/  # Gerar PDF
│   ├── whatsapp/send/     # Enviar via WhatsApp
│   └── cron/              # Automações agendadas
lib/
├── prisma.ts              # Cliente Prisma
├── auth.ts                # Configuração NextAuth
├── meta-ads.ts            # Integração Meta Ads
├── google-ads.ts          # Integração Google Ads
├── evolution-api.ts       # Integração WhatsApp
├── pdf-generator.ts       # Geração de PDF
└── utils.ts               # Funções utilitárias
prisma/
├── schema.prisma          # Schema completo (10 modelos)
└── seed.ts                # Cria usuário admin inicial
```
