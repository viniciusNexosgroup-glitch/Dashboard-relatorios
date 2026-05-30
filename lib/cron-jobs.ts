import cron from 'node-cron'
import { prisma } from './prisma'
import { syncMetaAccount } from './meta-ads'
import { syncGoogleAccount } from './google-ads'
import { checkAndAlertLowBalances } from './balance-alerts'
import { refreshMetaTokenIfNearExpiry } from './meta-token'
import { warmGroupsCache } from './whatsapp-groups-cache'

// Runs scheduled jobs in-process while the Next.js server is up.
// Timezone is fixed to São Paulo so the schedule matches the user's day.
const TZ = 'America/Sao_Paulo'

let scheduled = false

// syncDays=7 for daily syncs (low IO), syncDays=60 for the weekly deep sync (catches retroactive attribution)
async function runSyncAllAccounts(triggerLabel: string, syncDays = 7) {
  const tag = `[cron ${triggerLabel}]`
  console.log(`\n${tag} ━━━━━━━━ INICIO ━━━━━━━━ ${new Date().toLocaleString('pt-BR', { timeZone: TZ })} (janela: ${syncDays} dias)`)

  // ── Etapa 1: Garante token Meta fresco antes de qualquer chamada ──
  console.log(`${tag} [1/3] verificando token Meta...`)
  try {
    const tokenResult = await refreshMetaTokenIfNearExpiry()
    if (tokenResult.refreshed) {
      console.log(`${tag} [1/3] token Meta renovado, vale até ${tokenResult.expiresAt?.toISOString()}`)
    } else {
      console.log(`${tag} [1/3] token Meta OK (próx. expiry: ${tokenResult.expiresAt?.toISOString() || 'desconhecido'})`)
    }
  } catch (err: any) {
    console.error(`${tag} [1/3] check de token falhou:`, err.message)
  }

  // ── Etapa 2: Sync de todas as contas (atualiza métricas + saldo no banco) ──
  const accounts = await prisma.adAccount.findMany({ where: { active: true } })
  console.log(`${tag} [2/3] sincronizando ${accounts.length} contas (cada uma atualiza saldo no DB)...`)
  let ok = 0, fail = 0
  for (const account of accounts) {
    try {
      if (account.platform === 'META') await syncMetaAccount(account.id, syncDays)
      else await syncGoogleAccount(account.id, syncDays)
      ok++
    } catch (err: any) {
      console.error(`${tag} sync error ${account.id}:`, err.message)
      fail++
    }
  }
  console.log(`${tag} [2/3] sync concluído: ${ok} ok, ${fail} fail`)

  // ── Etapa 3: SOMENTE DEPOIS do sync — lê saldos atualizados e dispara alertas ──
  console.log(`${tag} [3/3] verificando saldos baixos com dados ATUALIZADOS...`)
  try {
    const alertResult = await checkAndAlertLowBalances()
    console.log(`${tag} [3/3] alertas de saldo: ${alertResult.alerted.length} enviados, ${alertResult.skipped.length} pulados (cooldown/sem WhatsApp)`)
    for (const a of alertResult.alerted) {
      console.log(`  → alerta enviado para ${a.clientName} (saldo: R$ ${a.balance.toFixed(2)})`)
    }
  } catch (err: any) {
    console.error(`${tag} [3/3] alertas de saldo falharam:`, err.message)
  }

  console.log(`${tag} ━━━━━━━━ FIM ━━━━━━━━`)
}

async function runMonthlyReport() {
  console.log(`\n[cron monthly-report] starting at ${new Date().toLocaleString('pt-BR', { timeZone: TZ })}`)
  try {
    // Use the existing endpoint so we don't duplicate the report-generation logic
    const res = await fetch(`http://localhost:${process.env.PORT || 3000}/api/cron/monthly-report`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    const data = await res.json()
    console.log('[cron monthly-report] result:', JSON.stringify(data).slice(0, 500))
  } catch (err: any) {
    console.error('[cron monthly-report] failed:', err.message)
  }
}

// Renova o token Meta de longa duração (válido por 60 dias) trocando-o por outro novo.
// Roda toda segunda-feira de madrugada — sempre mantém ≥53 dias de validade.
async function runRefreshMetaToken() {
  console.log(`\n[cron refresh-meta-token] starting at ${new Date().toLocaleString('pt-BR', { timeZone: TZ })}`)
  try {
    const res = await fetch(`http://localhost:${process.env.PORT || 3000}/api/cron/refresh-meta-token`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    const data = await res.json()
    if (data.ok) {
      console.log(`[cron refresh-meta-token] OK, novo token válido até ${data.expiresAt}`)
    } else {
      console.error('[cron refresh-meta-token] falhou:', data.error)
    }
  } catch (err: any) {
    console.error('[cron refresh-meta-token] falhou:', err.message)
  }
}

// Retém 90 dias de métricas (cobre o filtro lastMonth que vai até ~60 dias atrás).
// Retém 30 dias de sync_logs (histórico operacional suficiente).
const METRICS_RETENTION_DAYS = 90
const SYNC_LOG_RETENTION_DAYS = 30

async function cleanOldData() {
  const tag = '[cron cleanup]'
  const now = new Date()
  const metricsCutoff = new Date(now.getTime() - METRICS_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const syncLogCutoff = new Date(now.getTime() - SYNC_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  console.log(`\n${tag} ━━━━━━━━ INICIO ━━━━━━━━ ${now.toLocaleString('pt-BR', { timeZone: TZ })}`)
  try {
    const [metrics, logs] = await Promise.all([
      prisma.dailyMetric.deleteMany({ where: { date: { lt: metricsCutoff } } }),
      prisma.syncLog.deleteMany({ where: { startedAt: { lt: syncLogCutoff } } }),
    ])
    console.log(`${tag} daily_metrics removidos: ${metrics.count} (data < ${metricsCutoff.toLocaleDateString('pt-BR')})`)
    console.log(`${tag} sync_logs removidos: ${logs.count} (> ${SYNC_LOG_RETENTION_DAYS} dias)`)
  } catch (err: any) {
    console.error(`${tag} falhou:`, err.message)
  }
  console.log(`${tag} ━━━━━━━━ FIM ━━━━━━━━`)
}

export function startCronJobs() {
  if (scheduled) return
  scheduled = true

  // Sync 3x per day — 08:00, 14:00, 20:00 (São Paulo)
  cron.schedule('0 8 * * *', () => runSyncAllAccounts('08:00'), { timezone: TZ })
  cron.schedule('0 14 * * *', () => runSyncAllAccounts('14:00'), { timezone: TZ })
  cron.schedule('0 20 * * *', () => runSyncAllAccounts('20:00'), { timezone: TZ })

  // Monthly report — day 1 at 09:30 (sync das 08:00 ja deve ter terminado mesmo com muitos clientes)
  cron.schedule('30 9 1 * *', () => runMonthlyReport(), { timezone: TZ })

  // Refresh do token Meta — toda segunda às 03:00 SP. Tokens duram 60 dias,
  // então renovar semanalmente garante sempre >53 dias de validade restantes.
  cron.schedule('0 3 * * 1', () => runRefreshMetaToken(), { timezone: TZ })

  // Pré-aquece cache de grupos WhatsApp no startup (em 30s pra dar tempo do server estabilizar)
  // e revalida a cada 25 minutos pra sempre ter cache fresco (TTL é 30min).
  setTimeout(() => {
    warmGroupsCache().then((r) =>
      console.log(`[cron] groups cache warm: ${r.ok ? r.count + ' grupos' : 'falhou - ' + r.error}`)
    )
  }, 30_000)
  cron.schedule('*/25 * * * *', () => {
    warmGroupsCache().then((r) => {
      if (!r.ok) console.warn(`[cron] groups cache refresh falhou: ${r.error}`)
    })
  }, { timezone: TZ })

  // Sync profundo semanal — sábado às 01:00 SP: janela de 60 dias para pegar atualizações
  // retroativas de atribuição do Meta (conversões podem ser atribuídas até 28 dias após o clique).
  // Roda antes do cleanup (domingo 02:00) para não deletar dados que acabaram de ser sincronizados.
  cron.schedule('0 1 * * 6', () => runSyncAllAccounts('deep-60d', 60), { timezone: TZ })

  // Cleanup semanal — domingo às 02:00 SP (mantém 90 dias de métricas, 30 dias de sync_logs)
  cron.schedule('0 2 * * 0', () => cleanOldData(), { timezone: TZ })

  console.log('[cron] scheduled: sync 08/14/20h (7d), deep sync sábado 01:00 (60d), monthly day-1 09:30, token segunda 03:00, groups cache a cada 25min, cleanup domingo 02:00 (SP)')
}
