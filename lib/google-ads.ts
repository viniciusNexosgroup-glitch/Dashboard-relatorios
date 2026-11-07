import axios from 'axios'
import { prisma } from './prisma'
import { getGoogleRefreshToken } from './google-oauth'
import { formatCurrency, formatSPDate, getDateRange } from './utils'

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

// accountLoginCustomerId: MCC gravada na conta (contas acessíveis só via MCC). Sem ela,
// cai no GOOGLE_MANAGER_CUSTOMER_ID do .env (ou nenhum header, para acesso direto).
function getGoogleHeaders(accessToken: string, accountLoginCustomerId?: string | null): Record<string, string> {
  const loginCustomerId = accountLoginCustomerId || getGoogleLoginCustomerId()
  return {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN || '',
    ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
  }
}

type GoogleAccountRef = { id: string; accountId: string; loginCustomerId: string | null }

function isPermissionDenied(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false
  const data = error.response?.data as {
    error?: { details?: { errors?: { errorCode?: { authorizationError?: string } }[] }[] }
  } | undefined
  return !!data?.error?.details?.some((d) => d.errors?.some((e) => e.errorCode?.authorizationError === 'USER_PERMISSION_DENIED'))
}

// Procura, entre as contas acessíveis pelo login, a MCC que gerencia esta conta
async function findGoogleManagerFor(customerId: string, accessToken: string): Promise<string | null> {
  const headers = { Authorization: `Bearer ${accessToken}`, 'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN || '' }
  const res = await googleApi.get(`${GOOGLE_API_BASE}/customers:listAccessibleCustomers`, { headers })
  const ids: string[] = (res.data?.resourceNames || []).map((r: string) => r.replace('customers/', ''))
  for (const id of ids) {
    if (id === customerId) continue
    try {
      const r = await googleApi.post(
        `${GOOGLE_API_BASE}/customers/${id}/googleAds:search`,
        { query: `SELECT customer_client.id FROM customer_client WHERE customer_client.id = ${customerId}` },
        { headers: { ...headers, 'login-customer-id': id } }
      )
      if (r.data?.results?.length) return id
    } catch {
      // não é MCC (ou não gerencia esta conta) — segue para a próxima
    }
  }
  return null
}

// Consulta GAQL na conta. Conta vinculada sem a MCC (antes da correção ou cadastrada à mão)
// recebe USER_PERMISSION_DENIED: descobre a MCC que a gerencia, grava em loginCustomerId e repete.
async function googleSearch(account: GoogleAccountRef, accessToken: string, query: string) {
  const customerId = account.accountId.replace(/-/g, '')
  const run = async () =>
    (await googleApi.post(
      `${GOOGLE_API_BASE}/customers/${customerId}/googleAds:search`,
      { query },
      { headers: getGoogleHeaders(accessToken, account.loginCustomerId) }
    )).data?.results || []
  try {
    return await run()
  } catch (error) {
    if (account.loginCustomerId || !isPermissionDenied(error)) throw error
    const managerId = await findGoogleManagerFor(customerId, accessToken)
    if (!managerId) throw error
    await prisma.adAccount.update({ where: { id: account.id }, data: { loginCustomerId: managerId } })
    account.loginCustomerId = managerId
    return run()
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
      { headers: getGoogleHeaders(accessToken, account.loginCustomerId) }
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
// período e devolve os MAIS PESQUISADOS (ranqueados por impressões, desempate por
// cliques). Cap padrão de 50 pra não virar um PDF gigante — o período inteiro pode
// ter milhares de termos únicos (cauda longa de 1 impressão). Best-effort por conta
// (falha de uma não derruba as outras). Fonte única usada pelo PDF e pelo dashboard
// interno (ficam iguais).
export async function getClientGoogleSearchTerms(
  clientId: string,
  start: Date,
  end: Date,
  limit = 50
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
  return Array.from(merged.values())
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
    .slice(0, limit)
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

    const rows = await googleSearch(account, accessToken, query)
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

interface GoogleAccountBudget {
  name?: string
  approvedStartDateTime?: string
  approvedEndDateTime?: string
  adjustedSpendingLimitMicros?: string
  approvedSpendingLimitMicros?: string
  amountServedMicros?: string
}

// Orçamento vigente: já começou e não terminou. Sem nenhum vigente, o de início mais recente.
function pickCurrentBudget(budgets: GoogleAccountBudget[]): GoogleAccountBudget | undefined {
  const now = Date.now()
  const time = (s?: string) => (s ? Date.parse(s.replace(' ', 'T')) : NaN) // "2026-01-01 00:00:00" (fuso da conta)
  const current = budgets.filter((b) => !(time(b.approvedStartDateTime) > now) && !(time(b.approvedEndDateTime) <= now))
  return (current.length ? current : budgets).sort(
    (a, b) => (time(b.approvedStartDateTime) || 0) - (time(a.approvedStartDateTime) || 0)
  )[0]
}

// Anúncios parados: zero impressões no dia de ontem inteiro, tendo veiculado em algum dos
// 7 dias anteriores. Em 60 dias de histórico nenhuma conta ativa zerou um dia por outro
// motivo, então isso aponta para cobrança recusada no cartão (ou saldo esgotado).
// Só vale se o sync da conta rodou hoje — dado faltando não pode virar alarme.
async function googleAdsStoppedYesterday(adAccountId: string): Promise<boolean> {
  const lastSync = await prisma.syncLog.findFirst({
    where: { adAccountId, status: 'SUCCESS' },
    orderBy: { finishedAt: 'desc' },
    select: { finishedAt: true },
  })
  if (!lastSync?.finishedAt || formatSPDate(lastSync.finishedAt) !== formatSPDate()) return false

  const yesterday = getDateRange('yesterday').start
  const rows = await prisma.dailyMetric.groupBy({
    by: ['date'],
    where: { campaign: { adAccountId }, date: { gte: new Date(yesterday.getTime() - 7 * 86_400_000), lte: yesterday } },
    _sum: { impressions: true },
  })
  const impressionsOn = (d: Date) => rows.find((r) => r.date.getTime() === d.getTime())?._sum.impressions || 0
  const ranBefore = rows.some((r) => r.date.getTime() < yesterday.getTime() && (r._sum.impressions || 0) > 0)
  return ranBefore && impressionsOn(yesterday) === 0
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

  const [customerRow] = await googleSearch(account, accessToken, `SELECT customer.currency_code, customer.status FROM customer LIMIT 1`)
  const customer = customerRow?.customer

  try {
    // Uma conta pode ter vários orçamentos aprovados (antigos já encerrados + o vigente)
    const budgetRows = await googleSearch(account, accessToken, `
      SELECT
        account_budget.name,
        account_budget.approved_start_date_time,
        account_budget.approved_end_date_time,
        account_budget.adjusted_spending_limit_micros,
        account_budget.approved_spending_limit_micros,
        account_budget.amount_served_micros
      FROM account_budget
      WHERE account_budget.status = APPROVED
    `)
    const budget = pickCurrentBudget(budgetRows.map((r: { accountBudget: GoogleAccountBudget }) => r.accountBudget))
    const spendCap = microsToCurrency(budget?.adjustedSpendingLimitMicros) ?? microsToCurrency(budget?.approvedSpendingLimitMicros)
    const amountServed = microsToCurrency(budget?.amountServedMicros)
    // Limite finito = conta com saldo/orçamento (o saldo é o que falta gastar do limite).
    // Sem limite (INFINITE) = pagamento automático no cartão: o Google não informa saldo.
    const finite = !!budget && spendCap != null

    const campaignRows = await googleSearch(account, accessToken, `SELECT campaign.primary_status FROM campaign WHERE campaign.status = ENABLED`)
    const hasLiveCampaigns = campaignRows.some(
      (r: { campaign: { primaryStatus?: string } }) => !['ENDED', 'PENDING', 'PAUSED', 'REMOVED'].includes(r.campaign.primaryStatus || '')
    )

    const status = mapGoogleStatus(customer?.status)
    const adsStopped = status === 1 && hasLiveCampaigns && (await googleAdsStoppedYesterday(adAccountId))

    await prisma.adAccount.update({
      where: { id: adAccountId },
      data: {
        balance: finite && amountServed != null ? Math.max(spendCap - amountServed, 0) : null,
        amountSpent: amountServed,
        spendCap: finite ? spendCap : null,
        currency: customer?.currencyCode || null,
        // 3 = anúncios parados (mesmo código do "pagamento pendente" do Meta): o Google não expõe
        // "cartão recusado" na API — o que aparece é a conta parar de veicular com campanhas ativas
        accountStatus: adsStopped ? 3 : status,
        fundingType: !budget ? 'google_limited' : finite ? 'google_budget' : 'google_unlimited',
        fundingDisplay: !budget
          ? 'Sem orçamento de conta aprovado no Google Ads'
          : finite
            ? `${budget.name || 'Orçamento da conta'} · limite ${formatCurrency(spendCap)}`
            : 'Sem limite de gasto — o Google não informa saldo',
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
