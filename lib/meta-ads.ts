import axios from 'axios'
import { prisma } from './prisma'
import { getMetaAccessToken } from './meta-token'
import { formatSPDate } from './utils'
import { isMetaTokenError, markTokenError, clearTokenError } from './token-alerts'

// Versão da Graph API configurável via env var — Meta deprecia versões periodicamente.
// Verifique compatibilidade em https://developers.facebook.com/docs/graph-api/changelog
const META_API_VERSION = process.env.META_API_VERSION || 'v19.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`
const INSIGHT_FIELDS = 'spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,cpm,frequency,actions,purchase_roas'

// Cliente axios dedicado pro Meta com timeout de 60s — protege o sync de travar
// caso a API do Meta lentifique ou pare de responder.
const metaApi = axios.create({ timeout: 60_000 })

// Lock em memória: impede que o mesmo adAccountId seja sincronizado em paralelo
// (ex: cron + clique manual ao mesmo tempo). Evita corrupção de dados pelo
// delete+create de daily metrics.
const syncingAccounts = new Set<string>()

// Extrai a mensagem REAL do erro do Meta. Sem isso o syncLog guarda só o genérico
// "Request failed with status code 400" do axios, que esconde a causa (ex: token
// inválido, permissão faltando) e torna o diagnóstico às cegas.
export function getMetaErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const e = (error.response?.data as any)?.error
    if (e?.message) {
      const code = e.code ? `[${e.code}${e.error_subcode ? `/${e.error_subcode}` : ''}] ` : ''
      return `${code}${e.message}`
    }
    return error.message
  }
  return error instanceof Error ? error.message : 'Erro desconhecido'
}

// Regular sync: last 7 days — covers most attribution windows and minimises Disk IO.
// Deep sync (weekly): last 60 days — catches retroactive attribution updates from Meta.
// Use this instead of `date_preset: 'last_30d'`, which excludes today.
function getSyncTimeRange(days = 7): string {
  const now = new Date()
  const until = formatSPDate(now)
  const since = formatSPDate(new Date(now.getTime() - days * 24 * 60 * 60 * 1000))
  return JSON.stringify({ since, until })
}

function parseActions(
  actions: { action_type: string; value: string }[] | undefined,
  type: string
): number {
  return parseFloat(actions?.find((a) => a.action_type === type)?.value || '0')
}

function buildMetricData(day: any) {
  const formLeads = parseActions(day.actions, 'lead')
  const msgConv =
    parseActions(day.actions, 'onsite_conversion.messaging_conversation_started_7d') ||
    parseActions(day.actions, 'onsite_conversion.total_messaging_connection')
  const conversions = parseActions(day.actions, 'offsite_conversion.fb_pixel_purchase')
  const linkClicks = parseInt(day.inline_link_clicks || '0')
  const profileVisits = parseActions(day.actions, 'instagram_profile_visit')
  const landingPageViews =
    parseActions(day.actions, 'landing_page_view') ||
    parseActions(day.actions, 'onsite_conversion.landing_page_view')
  const primaryLeads = formLeads || msgConv || 0
  const spend = parseFloat(day.spend || '0')
  return {
    spend,
    impressions: parseInt(day.impressions || '0'),
    reach: parseInt(day.reach || '0'),
    clicks: parseInt(day.clicks || '0'),
    linkClicks,
    ctr: parseFloat(day.ctr || '0'),
    cpc: parseFloat(day.cpc || '0'),
    cpm: parseFloat(day.cpm || '0'),
    frequency: parseFloat(day.frequency || '0'),
    leads: formLeads,
    msgConversations: msgConv,
    conversions,
    profileVisits,
    landingPageViews,
    costPerLead: primaryLeads > 0 ? spend / primaryLeads : null,
    costPerConv: conversions > 0 ? spend / conversions : null,
    roas: parseFloat(day.purchase_roas?.[0]?.value || '0') || null,
  }
}

async function fetchAllPages(url: string, params: any): Promise<any[]> {
  const results: any[] = []
  // First request with params
  const first = await metaApi.get(url, { params })
  results.push(...(first.data.data || []))
  // Follow paging.next URLs directly (Meta insights uses full URLs, not just cursors)
  let nextUrl: string | null = first.data.paging?.next ?? null
  while (nextUrl) {
    const res = await metaApi.get(nextUrl)
    results.push(...(res.data.data || []))
    nextUrl = res.data.paging?.next ?? null
  }
  return results
}

// Process an array in parallel chunks to avoid overwhelming the DB connection pool
async function parallelMap<T, R>(items: T[], chunkSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    const r = await Promise.all(chunk.map(fn))
    results.push(...r)
  }
  return results
}

export async function syncMetaAccount(adAccountId: string, syncDays = 7) {
  // Lock: impede sync concorrente da mesma conta (race condition no delete+create de metrics)
  if (syncingAccounts.has(adAccountId)) {
    throw new Error('Sync já em andamento para esta conta — aguarde')
  }
  syncingAccounts.add(adAccountId)

  // Tudo após o lock precisa ser envolvido em try/finally pra GARANTIR liberação,
  // inclusive a busca do token e a criação do syncLog (que podem falhar).
  let syncLogId: string | null = null
  try {
    const account = await prisma.adAccount.findUnique({ where: { id: adAccountId } })
    if (!account) throw new Error('Conta Meta não encontrada')

    // Primeira sincronizacao bem-sucedida da conta? Faz backfill de 60 dias pra ja nascer
    // com historico (senao contas novas ficam so com a janela de 7 dias ate o deep de sabado).
    const hadSuccess = await prisma.syncLog.findFirst({ where: { adAccountId, status: 'SUCCESS' }, select: { id: true } })
    const effectiveDays = hadSuccess ? syncDays : 60

    const token =
      account.accessToken === '__system__' || !account.accessToken
        ? await getMetaAccessToken()
        : account.accessToken

    const accountExternalId = account.accountId
    const syncLog = await prisma.syncLog.create({ data: { adAccountId, status: 'RUNNING' } })
    syncLogId = syncLog.id

    // ── 1. Campaigns metadata (1 call) ────────────────────────────
    // No effective_status filter — fetches default statuses. Archived campaigns
    // are fetched individually later when their ads appear in insights.
    const campaignsRaw = await fetchAllPages(
      `${META_API_BASE}/${accountExternalId}/campaigns`,
      {
        access_token: token,
        fields: 'id,name,status,objective',
        limit: 200,
      }
    )

    const campaignExternalToDb = new Map<string, string>()
    const campaignResults = await parallelMap(campaignsRaw, 15, async (c: any) => {
      const db = await prisma.campaign.upsert({
        where: { adAccountId_externalId: { adAccountId, externalId: c.id } },
        update: { name: c.name, status: c.status, objective: c.objective },
        create: { adAccountId, externalId: c.id, name: c.name, status: c.status, objective: c.objective },
      })
      return { externalId: c.id, dbId: db.id }
    })
    for (const r of campaignResults) campaignExternalToDb.set(r.externalId, r.dbId)

    // ── 2. Campaign insights — covers last 60 days through today (SP timezone) ──
    const timeRange = getSyncTimeRange(effectiveDays)
    const campaignInsights = await fetchAllPages(
      `${META_API_BASE}/${accountExternalId}/insights`,
      {
        access_token: token,
        level: 'campaign',
        fields: `campaign_id,${INSIGHT_FIELDS}`,
        time_increment: 1,
        time_range: timeRange,
        limit: 500,
      }
    )

    // Recupera metadados de campanhas que RODARAM (aparecem nos insights) mas nao vieram
    // na lista de /campaigns (ex: pausadas/arquivadas). Sem isso, suas metricas eram
    // descartadas (dbId null) e a campanha sumia do dashboard. Busca nome + status atual.
    const insightCampaignIds = Array.from(new Set(campaignInsights.map((d: any) => d.campaign_id).filter(Boolean)))
    const missingCampaigns = insightCampaignIds.filter((cid) => !campaignExternalToDb.has(cid))
    await parallelMap(missingCampaigns, 10, async (campaignId) => {
      try {
        const cRes = await metaApi.get(`${META_API_BASE}/${campaignId}`, {
          params: { access_token: token, fields: 'id,name,status,objective' },
        })
        const c = cRes.data
        const db = await prisma.campaign.upsert({
          where: { adAccountId_externalId: { adAccountId, externalId: c.id } },
          update: { name: c.name, status: c.status, objective: c.objective },
          create: { adAccountId, externalId: c.id, name: c.name, status: c.status, objective: c.objective },
        })
        campaignExternalToDb.set(c.id, db.id)
      } catch {
        // Se nao der pra buscar, a metrica dessa campanha e' ignorada (comportamento antigo)
      }
    })

    const campaignMetrics = campaignInsights
      .map((day) => {
        const dbId = campaignExternalToDb.get(day.campaign_id)
        if (!dbId) return null
        const data = buildMetricData(day)
        return {
          id: `${dbId}-${day.date_start}`,
          campaignId: dbId,
          date: new Date(day.date_start),
          ...data,
        }
      })
      .filter(Boolean) as any[]

    // Delete + insert envoltos em transação: ou ambos passam, ou nenhum.
    // Evita janela onde o cliente fica sem dados no dashboard.
    if (campaignMetrics.length > 0) {
      const campaignDbIds = Array.from(campaignExternalToDb.values())
      const dates = campaignMetrics.map((m) => m.date.getTime())
      const minDate = new Date(Math.min(...dates))
      const maxDate = new Date(Math.max(...dates))
      await prisma.$transaction([
        prisma.dailyMetric.deleteMany({
          where: { campaignId: { in: campaignDbIds }, date: { gte: minDate, lte: maxDate } },
        }),
        prisma.dailyMetric.createMany({ data: campaignMetrics, skipDuplicates: true }),
      ])
    }
    let recordsSynced = campaignMetrics.length

    // ── 3. Ad insights — includes ad_name, adset_id, campaign_id directly ──
    try {
      const adInsights = await fetchAllPages(
        `${META_API_BASE}/${accountExternalId}/insights`,
        {
          access_token: token,
          level: 'ad',
          fields: `ad_id,ad_name,adset_id,campaign_id,${INSIGHT_FIELDS}`,
          time_increment: 1,
          time_range: timeRange,
          limit: 500,
        }
      )

      // ── 4. Build ad records using insights data (always has campaign_id, adset_id) ──
      const adExternalToDbId = new Map<string, string>()
      const adSetExternalToDbId = new Map<string, string>()

      // Group insights by ad_id to dedupe
      const uniqueAds = new Map<string, { ad_id: string; ad_name: string; adset_id: string; campaign_id: string }>()
      for (const r of adInsights) {
        if (!r.ad_id || !r.adset_id || !r.campaign_id) continue
        if (!uniqueAds.has(r.ad_id)) {
          uniqueAds.set(r.ad_id, {
            ad_id: r.ad_id,
            ad_name: r.ad_name || r.ad_id,
            adset_id: r.adset_id,
            campaign_id: r.campaign_id,
          })
        }
      }

      // ── 5. Batch fetch thumbnails + nome/status atual dos anuncios (50 per call) ──
      const thumbnailMap = new Map<string, string | null>()
      const adStatusMap = new Map<string, string>()
      const allAdIds = Array.from(uniqueAds.keys())
      for (let i = 0; i < allAdIds.length; i += 50) {
        const batch = allAdIds.slice(i, i + 50)
        try {
          const res = await metaApi.get(META_API_BASE, {
            params: {
              access_token: token,
              ids: batch.join(','),
              fields: 'name,status,creative{thumbnail_url,image_url}',
            },
          })
          for (const [id, ad] of Object.entries(res.data as Record<string, any>)) {
            const creative = ad.creative
            thumbnailMap.set(id, creative?.thumbnail_url || creative?.image_url || null)
            if (ad.status) adStatusMap.set(id, ad.status)
          }
        } catch {
          // Thumbnails/status sao opcionais — falha nao bloqueia o sync
        }
      }

      // ── 5b. Batch fetch nome + status atual dos conjuntos (ad sets) ──
      const adSetMetaMap = new Map<string, { name: string; status: string }>()
      const allAdSetIds = Array.from(new Set(Array.from(uniqueAds.values()).map((a) => a.adset_id)))
      for (let i = 0; i < allAdSetIds.length; i += 50) {
        const batch = allAdSetIds.slice(i, i + 50)
        try {
          const res = await metaApi.get(META_API_BASE, {
            params: { access_token: token, ids: batch.join(','), fields: 'name,status' },
          })
          for (const [id, as] of Object.entries(res.data as Record<string, any>)) {
            adSetMetaMap.set(id, { name: as.name || id, status: as.status || 'UNKNOWN' })
          }
        } catch {
          // metadata opcional — nao bloqueia o sync
        }
      }

      // Fetch any missing campaigns in parallel (small chunks to respect rate limits)
      const missingCampaignIds = Array.from(new Set(
        Array.from(uniqueAds.values())
          .map((ad) => ad.campaign_id)
          .filter((cid) => !campaignExternalToDb.has(cid))
      ))
      await parallelMap(missingCampaignIds, 10, async (campaignId) => {
        try {
          const cRes = await metaApi.get(`${META_API_BASE}/${campaignId}`, {
            params: { access_token: token, fields: 'id,name,status,objective' },
          })
          const c = cRes.data
          const db = await prisma.campaign.upsert({
            where: { adAccountId_externalId: { adAccountId, externalId: c.id } },
            update: { name: c.name, status: c.status, objective: c.objective },
            create: { adAccountId, externalId: c.id, name: c.name, status: c.status, objective: c.objective },
          })
          campaignExternalToDb.set(c.id, db.id)
        } catch {
          // Skip campaigns we can't fetch
        }
      })

      // Upsert ad sets in parallel
      const uniqueAdSets = new Map<string, string>() // adset_externalId → campaignDbId
      for (const ad of uniqueAds.values()) {
        const campaignDbId = campaignExternalToDb.get(ad.campaign_id)
        if (!campaignDbId) continue
        if (!uniqueAdSets.has(ad.adset_id)) uniqueAdSets.set(ad.adset_id, campaignDbId)
      }
      await parallelMap(Array.from(uniqueAdSets.entries()), 20, async ([adsetExternalId, campaignDbId]) => {
        const meta = adSetMetaMap.get(adsetExternalId)
        const name = meta?.name || adsetExternalId
        const status = meta?.status || 'UNKNOWN'
        const dbAdSet = await prisma.adSet.upsert({
          where: { campaignId_externalId: { campaignId: campaignDbId, externalId: adsetExternalId } },
          update: { name, status },
          create: { campaignId: campaignDbId, externalId: adsetExternalId, name, status },
        })
        adSetExternalToDbId.set(adsetExternalId, dbAdSet.id)
      })

      // Upsert ads in parallel
      await parallelMap(Array.from(uniqueAds.values()), 20, async (ad) => {
        const adSetDbId = adSetExternalToDbId.get(ad.adset_id)
        if (!adSetDbId) return
        const thumbnailUrl = thumbnailMap.get(ad.ad_id) ?? null
        const status = adStatusMap.get(ad.ad_id) || 'UNKNOWN'
        const dbAd = await prisma.ad.upsert({
          where: { adSetId_externalId: { adSetId: adSetDbId, externalId: ad.ad_id } },
          update: { name: ad.ad_name, thumbnailUrl, status },
          create: { adSetId: adSetDbId, externalId: ad.ad_id, name: ad.ad_name, status, thumbnailUrl },
        })
        adExternalToDbId.set(ad.ad_id, dbAd.id)
      })

      // Build ad daily metrics, then deleteMany + createMany (much faster than upserts)
      const adMetrics = adInsights
        .map((day) => {
          const dbAdId = adExternalToDbId.get(day.ad_id)
          if (!dbAdId) return null
          const data = buildMetricData(day)
          return {
            id: `ad-${dbAdId}-${day.date_start}`,
            adId: dbAdId,
            date: new Date(day.date_start),
            ...data,
          }
        })
        .filter(Boolean) as any[]

      if (adMetrics.length > 0) {
        const adDbIds = Array.from(adExternalToDbId.values())
        const dates = adMetrics.map((m) => m.date.getTime())
        const minDate = new Date(Math.min(...dates))
        const maxDate = new Date(Math.max(...dates))
        // Transação atômica: ou ambos passam, ou nenhum (evita perda temporária)
        await prisma.$transaction([
          prisma.dailyMetric.deleteMany({
            where: { adId: { in: adDbIds }, date: { gte: minDate, lte: maxDate } },
          }),
          prisma.dailyMetric.createMany({ data: adMetrics, skipDuplicates: true }),
        ])
        recordsSynced += adMetrics.length  // reflete trabalho total no syncLog
      }
    } catch (adErr: any) {
      console.error('Ad sync error:', adErr.message)
    }

    // ── 6. Snapshot dos financials da conta (saldo, gasto total, tipo de pagamento) ──
    await refreshAccountFinancials(adAccountId).catch((e) =>
      console.error('Account financials sync error:', e.message)
    )

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: 'SUCCESS', recordsSynced, finishedAt: new Date() },
    })

    // Sync ok — limpa flag de erro de token se estava setada
    await clearTokenError(adAccountId).catch(() => {})

    return { success: true, recordsSynced }
  } catch (error: any) {
    if (syncLogId) {
      await prisma.syncLog.update({
        where: { id: syncLogId },
        data: { status: 'ERROR', errorMessage: getMetaErrorMessage(error), finishedAt: new Date() },
      }).catch(() => {})
    }
    // Se o erro for de token expirado/inválido, marca a conta e alerta o admin
    if (isMetaTokenError(error)) {
      await markTokenError(adAccountId, error).catch(() => {})
    }
    throw error
  } finally {
    // SEMPRE libera o lock — proteção contra travamento permanente da conta
    syncingAccounts.delete(adAccountId)
  }
}

// ── Alcance / Frequência DEDUPLICADOS do período ──────────────────────────────
// Alcance NÃO pode ser somado por dia: a mesma pessoa alcançada em vários dias
// contaria várias vezes (por isso a soma diária inflava ~2x). O gerenciador do
// Meta mostra o alcance ÚNICO do período. Buscamos esse valor direto na API
// (nível conta, SEM time_increment), que bate exatamente com o gerenciador.
// Cache curto em memória evita repetir a chamada quando o mesmo cliente/período
// é reaberto (o sync atualiza os dados ~3x/dia, então 15min é seguro).
interface MetaReach { reach: number; impressions: number; frequency: number }
const reachCache = new Map<string, { data: MetaReach; exp: number }>()
const REACH_TTL_MS = 15 * 60 * 1000

export async function fetchMetaAccountReach(adAccountId: string, start: Date, end: Date): Promise<MetaReach | null> {
  // As fronteiras vêm ancoradas em meia-noite UTC do dia do calendário, então
  // o componente de data em UTC É o dia certo (ex: 2026-07-01). formatSPDate
  // daria o dia errado aqui (00:00Z = 21h SP do dia anterior).
  const since = start.toISOString().slice(0, 10)
  const until = end.toISOString().slice(0, 10)
  const cacheKey = `${adAccountId}:${since}:${until}`
  const cached = reachCache.get(cacheKey)
  if (cached && cached.exp > Date.now()) return cached.data

  const account = await prisma.adAccount.findUnique({ where: { id: adAccountId } })
  if (!account) return null
  const token =
    account.accessToken === '__system__' || !account.accessToken
      ? await getMetaAccessToken()
      : account.accessToken

  const res = await metaApi.get(`${META_API_BASE}/${account.accountId}/insights`, {
    params: { access_token: token, fields: 'reach,frequency,impressions', time_range: JSON.stringify({ since, until }) },
  })
  const row = res.data?.data?.[0]
  if (!row) return null
  const data: MetaReach = {
    reach: parseInt(row.reach || '0'),
    impressions: parseInt(row.impressions || '0'),
    frequency: parseFloat(row.frequency || '0'),
  }
  reachCache.set(cacheKey, { data, exp: Date.now() + REACH_TTL_MS })
  return data
}

// Alcance deduplicado do cliente (soma as contas Meta ativas — cada conta já é
// deduplicada em si; entre contas distintas o próprio Meta também não dedupa).
export async function getClientMetaReach(clientId: string, start: Date, end: Date): Promise<{ reach: number; frequency: number } | null> {
  const accounts = await prisma.adAccount.findMany({
    where: { clientId, platform: 'META', active: true },
    select: { id: true },
  })
  if (accounts.length === 0) return null
  let totalReach = 0, totalImpr = 0, ok = false
  for (const a of accounts) {
    const r = await fetchMetaAccountReach(a.id, start, end).catch(() => null)
    if (r) { totalReach += r.reach; totalImpr += r.impressions; ok = true }
  }
  if (!ok || totalReach === 0) return null
  return { reach: totalReach, frequency: totalImpr / totalReach }
}

// Corrige Alcance/Frequência do Meta no objeto de métricas com o valor
// deduplicado do período. Best-effort: se a API falhar, mantém o valor somado
// (nunca derruba dashboard/relatório). Muta byPlatform.META e summary.totalReach.
export async function applyMetaPeriodReach(metrics: any, clientId: string, start: Date, end: Date): Promise<void> {
  const meta = metrics?.byPlatform?.META
  if (!meta) return
  const r = await getClientMetaReach(clientId, start, end).catch(() => null)
  if (!r || r.reach <= 0) return
  const googleReach = metrics?.byPlatform?.GOOGLE?.reach || 0
  meta.reach = r.reach
  meta.frequency = r.frequency
  if (metrics.summary) metrics.summary.totalReach = r.reach + googleReach
}

// Parses "R$317,15" or "R$ 1.234,56" from a string into a number
function parseBRBalance(text: string): number | null {
  const match = text.match(/R?\$\s*([\d.]+,\d{2}|\d+\.\d{2}|\d+)/i)
  if (!match) return null
  // Brazilian format "1.234,56" → "1234.56"
  const cleaned = match[1].replace(/\./g, '').replace(',', '.')
  const value = parseFloat(cleaned)
  return isNaN(value) ? null : value
}

// Fast endpoint — refreshes ONLY the financial snapshot (balance, funding type, etc.)
// Use this for the "Atualizar Saldos" button. ~1 API call per account = seconds total.
export async function refreshAccountFinancials(adAccountId: string): Promise<void> {
  const account = await prisma.adAccount.findUnique({ where: { id: adAccountId } })
  if (!account) throw new Error('Conta não encontrada')

  const token =
    account.accessToken === '__system__' || !account.accessToken
      ? await getMetaAccessToken()
      : account.accessToken

  const finRes = await metaApi.get(`${META_API_BASE}/${account.accountId}`, {
    params: {
      access_token: token,
      fields: 'balance,amount_spent,currency,spend_cap,account_status,name,funding_source_details',
    },
  })
  const d = finRes.data
  const ftCode = d.funding_source_details?.type
  const ftDisplay = (d.funding_source_details?.display_string || '').toString()
  const ftDisplayLower = ftDisplay.toLowerCase()

  // Classificação: SÓ é pré-pago se o display_string deixar claro.
  // Ignoramos "balance > 0" pq cartões de crédito tambem podem ter balance acumulado.
  const prepaidKeywords = ['saldo', 'prepaid', 'pré-paga', 'pre-paga', 'pré-pago', 'pre-pago', 'boleto', 'pix']
  const isPrepaidByKeyword = prepaidKeywords.some((k) => ftDisplayLower.includes(k))
  const isPrepaidByCode = ftCode === 16 || ftCode === 1024

  const creditCardKeywords = ['visa', 'master', 'amex', 'american express', 'elo', 'hipercard', 'cartão', 'cartao', 'discover', 'jcb', 'diners']
  const isCreditByKeyword = creditCardKeywords.some((k) => ftDisplayLower.includes(k))
  const isCreditByCode = ftCode === 1 || ftCode === 2

  // Credit card tem prioridade — se display tem "Mastercard" é cartão, mesmo se balance > 0
  const fundingType =
    (isCreditByKeyword || isCreditByCode)
      ? 'credit_card'
      : (isPrepaidByKeyword || isPrepaidByCode)
        ? 'prepaid'
        : ftCode === 4
          ? 'extended_credit'
          : ftCode != null || ftDisplay
            ? 'other'
            : null

  // Saldo real: pra contas pré-pagas, prefere o valor parseado do display_string
  // ("Saldo disponível (R$317,15 BRL)") que reflete o saldo atual.
  // Fallback pra campo `balance` da API (que pode estar desatualizado).
  let realBalance: number | null = null
  if (fundingType === 'prepaid') {
    const parsed = parseBRBalance(ftDisplay)
    realBalance = parsed ?? (d.balance != null ? parseFloat(d.balance) / 100 : null)
  } else {
    // Cartão de crédito não tem saldo real — não monitora
    realBalance = null
  }

  await prisma.adAccount.update({
    where: { id: adAccountId },
    data: {
      balance: realBalance,
      amountSpent: d.amount_spent != null ? parseFloat(d.amount_spent) / 100 : null,
      currency: d.currency || null,
      spendCap: d.spend_cap != null ? parseFloat(d.spend_cap) / 100 : null,
      accountStatus: d.account_status != null ? parseInt(d.account_status) : null,
      fundingType,
      fundingDisplay: ftDisplay || null,
      balanceLastSync: new Date(),
    },
  })
}
