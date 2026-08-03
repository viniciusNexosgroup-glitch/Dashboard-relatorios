import axios from 'axios'
import { prisma } from './prisma'
import { getGoogleRefreshToken } from './google-oauth'

// Versão configurável via env — Google bloqueia versões antigas (~1 ano após release).
// Em 2026-07 a mais recente é v24; v20 foi bloqueada (UNSUPPORTED_VERSION).
const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v24'
const GOOGLE_API_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`

// Cliente axios com timeout de 60s — evita sync travado se a API do Google lentificar
const googleApi = axios.create({ timeout: 60_000 })

export async function getGoogleAdsAccessToken(refreshToken: string): Promise<string> {
  const res = await googleApi.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )
  return res.data.access_token
}

function getGoogleLoginCustomerId(): string | undefined {
  return process.env.GOOGLE_MANAGER_CUSTOMER_ID?.replace(/-/g, '')
}

function getGoogleHeaders(accessToken: string): Record<string, string> {
  const loginCustomerId = getGoogleLoginCustomerId()
  return {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN || '',
    ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
  }
}

function microsToCurrency(value: string | number | null | undefined): number | null {
  if (value == null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed / 1_000_000 : null
}

function getGoogleErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as {
      error?: {
        message?: string
        details?: { errors?: { message?: string }[] }[]
      }
    } | undefined
    return (
      data?.error?.details?.[0]?.errors?.[0]?.message ||
      data?.error?.message ||
      error.message
    )
  }
  return error instanceof Error ? error.message : 'Erro desconhecido'
}

export interface GoogleSearchTerm {
  term: string
  impressions: number
  clicks: number
  conversions: number
  cost: number
}

// Termos de pesquisa REAIS que as pessoas digitaram no Google e acionaram os
// anúncios no período (recurso search_term_view — Rede de Pesquisa/Shopping).
// Usado no PDF do cliente ("o que pesquisaram"). NÃO é gravado no banco —
// é buscado ao vivo na hora do relatório, pra não inchar o Supabase free com
// milhares de termos únicos por dia. Best-effort: quem chama trata a falha.
// Obs: Performance Max/Display não expõem termos de pesquisa, então só campanhas
// de Pesquisa aparecem aqui.
//
// limit undefined = TODOS os termos que rodaram no período (pagina a API até o
// fim). Um número corta nos N mais pesquisados.
export async function fetchGoogleSearchTerms(
  adAccountId: string,
  start: Date,
  end: Date,
  limit?: number
): Promise<GoogleSearchTerm[]> {
  const account = await prisma.adAccount.findUnique({ where: { id: adAccountId } })
  if (!account) return []

  const refreshToken =
    account.refreshToken && account.refreshToken !== '__system__'
      ? account.refreshToken
      : await getGoogleRefreshToken()
  if (!refreshToken) return []

  const accessToken = await getGoogleAdsAccessToken(refreshToken)
  const customerId = account.accountId.replace(/-/g, '')
  const sinceStr = start.toISOString().split('T')[0]
  const untilStr = end.toISOString().split('T')[0]

  // Sem segments.date no SELECT → a API agrega o período inteiro por termo.
  // O mesmo termo ainda pode vir em grupos de anúncio diferentes, então
  // reagregamos por texto no código. Sem LIMIT: pega TUDO que rodou.
  const query = `
    SELECT
      search_term_view.search_term,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.cost_micros
    FROM search_term_view
    WHERE segments.date BETWEEN '${sinceStr}' AND '${untilStr}'
    ORDER BY metrics.impressions DESC
  `

  // Paginação: o endpoint search devolve 10000 linhas por página (fixo na v24 —
  // pageSize não é aceito) + nextPageToken. Percorre todas as páginas pra não
  // perder termos de cauda longa. O teto de páginas é só trava de segurança.
  const byTerm = new Map<string, GoogleSearchTerm>()
  let pageToken: string | undefined
  let pages = 0
  do {
    const res = await googleApi.post(
      `${GOOGLE_API_BASE}/customers/${customerId}/googleAds:search`,
      { query, ...(pageToken ? { pageToken } : {}) },
      { headers: getGoogleHeaders(accessToken) }
    )
    for (const row of res.data.results || []) {
      const term = String(row.searchTermView?.searchTerm || '').trim()
      if (!term) continue
      const existing = byTerm.get(term) || { term, impressions: 0, clicks: 0, conversions: 0, cost: 0 }
      existing.impressions += parseInt(row.metrics?.impressions || '0', 10)
      existing.clicks += parseInt(row.metrics?.clicks || '0', 10)
      existing.conversions += Number(row.metrics?.conversions || 0)
      existing.cost += Number(row.metrics?.costMicros || 0) / 1_000_000
      byTerm.set(term, existing)
    }
    pageToken = res.data.nextPageToken
  } while (pageToken && ++pages < 50)

  const all = Array.from(byTerm.values())
    .map((t) => ({ ...t, conversions: Math.round(t.conversions) }))
    .sort((a, b) => b.impressions - a.impressions)
  return typeof limit === 'number' ? all.slice(0, limit) : all
}

// Agrega os termos de pesquisa de TODAS as contas Google ativas de um cliente no
// período e devolve APENAS os que geraram conversão, ranqueados por nº de
// conversões (desempate por impressões). São as buscas que viraram resultado —
// o que interessa pro cliente. Best-effort por conta (falha de uma não derruba
// as outras). Fonte única usada pelo PDF e pelo dashboard interno (ficam iguais).
// limit undefined = todos os termos com conversão.
export async function getClientGoogleSearchTerms(
  clientId: string,
  start: Date,
  end: Date,
  limit?: number
): Promise<GoogleSearchTerm[]> {
  const googleAccounts = await prisma.adAccount.findMany({
    where: { clientId, platform: 'GOOGLE', active: true },
    select: { id: true },
  })
  if (googleAccounts.length === 0) return []

  const lists = await Promise.all(
    googleAccounts.map((a) => fetchGoogleSearchTerms(a.id, start, end).catch(() => []))
  )
  const merged = new Map<string, GoogleSearchTerm>()
  for (const t of lists.flat()) {
    const e = merged.get(t.term) || { term: t.term, impressions: 0, clicks: 0, conversions: 0, cost: 0 }
    e.impressions += t.impressions; e.clicks += t.clicks; e.conversions += t.conversions; e.cost += t.cost
    merged.set(t.term, e)
  }
  const converting = Array.from(merged.values())
    .filter((t) => t.conversions > 0)
    .sort((a, b) => b.conversions - a.conversions || b.impressions - a.impressions)
  return typeof limit === 'number' ? converting.slice(0, limit) : converting
}

export async function syncGoogleAccount(adAccountId: string, syncDays = 7) {
  const account = await prisma.adAccount.findUnique({ where: { id: adAccountId } })
  if (!account) throw new Error('Conta Google Ads não encontrada')

  // Se a conta tem refreshToken próprio (legacy), usa ele.
  // Caso contrário ou se for "__system__", usa o token compartilhado do OAuth/.env.
  const refreshToken =
    account.refreshToken && account.refreshToken !== '__system__'
      ? account.refreshToken
      : await getGoogleRefreshToken()

  if (!refreshToken) throw new Error('Nenhum token Google configurado (conecte sua conta em Configurações)')

  const accessToken = await getGoogleAdsAccessToken(refreshToken)
  const customerId = account.accountId.replace(/-/g, '')

  // Primeira sincronizacao bem-sucedida? Faz backfill de 60 dias pra ja nascer com historico.
  const hadSuccess = await prisma.syncLog.findFirst({ where: { adAccountId, status: 'SUCCESS' }, select: { id: true } })
  const effectiveDays = hadSuccess ? syncDays : 60

  const syncLog = await prisma.syncLog.create({
    data: { adAccountId, status: 'RUNNING' },
  })

  try {
    const until = new Date()
    const since = new Date(until.getTime() - effectiveDays * 24 * 60 * 60 * 1000)
    const sinceStr = since.toISOString().split('T')[0]
    const untilStr = until.toISOString().split('T')[0]

    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.average_cpc,
        metrics.average_cpm,
        metrics.conversions,
        metrics.conversions_value,
        metrics.cost_per_conversion,
        metrics.conversions_from_interactions_rate,
        segments.date
      FROM campaign
      WHERE segments.date BETWEEN '${sinceStr}' AND '${untilStr}'
        AND campaign.status != 'REMOVED'
      ORDER BY segments.date DESC
    `

    const res = await googleApi.post(
      `${GOOGLE_API_BASE}/customers/${customerId}/googleAds:search`,
      { query },
      {
        headers: getGoogleHeaders(accessToken),
      }
    )

    const rows = res.data.results || []
    let recordsSynced = 0

    for (const row of rows) {
      const campaign = row.campaign
      const metrics = row.metrics
      const date = new Date(row.segments.date)

      // advertising_channel_type (SEARCH/PERFORMANCE_MAX/SMART...) vai no campo objective —
      // o dashboard compartilhado usa pra mostrar o tipo da campanha, igual ao Ads Manager
      const channelType = campaign.advertisingChannelType || null
      const dbCampaign = await prisma.campaign.upsert({
        where: { adAccountId_externalId: { adAccountId, externalId: String(campaign.id) } },
        update: { name: campaign.name, status: campaign.status, objective: channelType },
        create: {
          adAccountId,
          externalId: String(campaign.id),
          name: campaign.name,
          status: campaign.status,
          objective: channelType,
        },
      })

      // API REST do Google retorna int64 como STRING ("445") e conversions como float
      // (atribuição data-driven gera frações) — normaliza pros tipos do schema (Int)
      const spend = (metrics.costMicros || 0) / 1_000_000
      const impressions = parseInt(metrics.impressions || '0', 10)
      const clicks = parseInt(metrics.clicks || '0', 10)
      const conversions = Math.round(Number(metrics.conversions || 0))
      const roas =
        metrics.conversionsValue && spend > 0 ? metrics.conversionsValue / spend : null

      await prisma.dailyMetric.upsert({
        where: { id: `${dbCampaign.id}-${row.segments.date}` },
        update: {
          spend,
          impressions,
          clicks,
          ctr: (metrics.ctr || 0) * 100,
          cpc: (metrics.averageCpc || 0) / 1_000_000,
          cpm: (metrics.averageCpm || 0) / 1_000_000,
          conversions,
          costPerConv: (metrics.costPerConversion || 0) / 1_000_000,
          convRate: (metrics.conversionsFromInteractionsRate || 0) * 100,
          roas,
        },
        create: {
          id: `${dbCampaign.id}-${row.segments.date}`,
          campaignId: dbCampaign.id,
          date,
          spend,
          impressions,
          clicks,
          ctr: (metrics.ctr || 0) * 100,
          cpc: (metrics.averageCpc || 0) / 1_000_000,
          cpm: (metrics.averageCpm || 0) / 1_000_000,
          conversions,
          costPerConv: (metrics.costPerConversion || 0) / 1_000_000,
          convRate: (metrics.conversionsFromInteractionsRate || 0) * 100,
          roas,
        },
      })
      recordsSynced++
    }

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'SUCCESS', recordsSynced, finishedAt: new Date() },
    })

    await refreshGoogleAccountFinancials(adAccountId).catch((e) =>
      console.error('Google account financials sync error:', e.message)
    )

    return { success: true, recordsSynced }
  } catch (error: unknown) {
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'ERROR', errorMessage: getGoogleErrorMessage(error), finishedAt: new Date() },
    })
    throw error
  }
}

// Mapeia o customer.status do Google (string) pros códigos numéricos da UI de Saldos
// (semântica Meta: 1=Ativa, 2=Desativada, 7=Bloqueada). null = Desconhecida.
function mapGoogleStatus(status: string | undefined): number | null {
  switch (status) {
    case 'ENABLED': return 1
    case 'CANCELED': return 2
    case 'CLOSED': return 2
    case 'SUSPENDED': return 7
    default: return null
  }
}

export async function refreshGoogleAccountFinancials(adAccountId: string): Promise<void> {
  const account = await prisma.adAccount.findUnique({ where: { id: adAccountId } })
  if (!account) throw new Error('Conta Google Ads nao encontrada')

  const refreshToken =
    account.refreshToken && account.refreshToken !== '__system__'
      ? account.refreshToken
      : await getGoogleRefreshToken()

  if (!refreshToken) throw new Error('Nenhum token Google configurado (conecte sua conta em Configuracoes)')

  const accessToken = await getGoogleAdsAccessToken(refreshToken)
  const customerId = account.accountId.replace(/-/g, '')
  const headers = getGoogleHeaders(accessToken)

  const customerRes = await googleApi.post(
    `${GOOGLE_API_BASE}/customers/${customerId}/googleAds:search`,
    {
      query: `
        SELECT
          customer.currency_code,
          customer.status
        FROM customer
        LIMIT 1
      `,
    },
    { headers }
  )

  const customer = customerRes.data?.results?.[0]?.customer

  try {
    const budgetRes = await googleApi.post(
      `${GOOGLE_API_BASE}/customers/${customerId}/googleAds:search`,
      {
        query: `
          SELECT
            account_budget.name,
            account_budget.status,
            account_budget.adjusted_spending_limit_micros,
            account_budget.adjusted_spending_limit_type,
            account_budget.approved_spending_limit_micros,
            account_budget.approved_spending_limit_type,
            account_budget.amount_served_micros,
            account_budget.total_adjustments_micros
          FROM account_budget
          WHERE account_budget.status = APPROVED
          LIMIT 1
        `,
      },
      { headers }
    )

    const budget = budgetRes.data?.results?.[0]?.accountBudget
    const adjustedLimit = microsToCurrency(budget?.adjustedSpendingLimitMicros)
    const approvedLimit = microsToCurrency(budget?.approvedSpendingLimitMicros)
    const amountServed = microsToCurrency(budget?.amountServedMicros)
    const spendCap = adjustedLimit ?? approvedLimit
    const balance =
      spendCap != null && amountServed != null
        ? Math.max(spendCap - amountServed, 0)
        : null
    const limitType = budget?.adjustedSpendingLimitType || budget?.approvedSpendingLimitType

    await prisma.adAccount.update({
      where: { id: adAccountId },
      data: {
        balance,
        amountSpent: amountServed,
        spendCap,
        currency: customer?.currencyCode || null,
        accountStatus: mapGoogleStatus(customer?.status),
        fundingType: budget ? 'monthly_invoicing' : null,
        fundingDisplay: budget
          ? `${budget.name || 'Orcamento da conta'} (${limitType || 'limite finito'})`
          : 'A API do Google Ads nao expoe saldo pre-pago/cartao; somente billing mensal quando disponivel.',
        balanceLastSync: new Date(),
      },
    })
  } catch (error: unknown) {
    const msg = getGoogleErrorMessage(error)

    await prisma.adAccount.update({
      where: { id: adAccountId },
      data: {
        balance: null,
        amountSpent: null,
        spendCap: null,
        currency: customer?.currencyCode || null,
        accountStatus: mapGoogleStatus(customer?.status),
        fundingType: 'google_limited',
        fundingDisplay: `Billing Google indisponivel via API: ${msg}`,
        balanceLastSync: new Date(),
      },
    })
  }
}
