import cron from 'node-cron'
import { prisma } from './prisma'
import { syncMetaAccount } from './meta-ads'
import { syncGoogleAccount } from './google-ads'
import { checkAndAlertLowBalances, checkAndAlertPaymentIssues } from './balance-alerts'
import { cleanOldData } from './cleanup'
import { sendMonthlyReports } from './monthly-report'
import { refreshMetaTokenIfNearExpiry, checkMetaTokenExpiryAlert } from './meta-token'
import { warmGroupsCache } from './whatsapp-groups-cache'
import { checkWhatsappHealthAndAlert } from './whatsapp-health'

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
  // Alerta o admin no WhatsApp se o token estiver a <= 10 dias de expirar
  await checkMetaTokenExpiryAlert().catch(() => {})
  // Checa saúde REAL do WhatsApp (detecta sessão "open mas quebrada") — atualiza
  // o cache lido pelo banner do dashboard e alerta o admin se degradado
  const waHealth = await checkWhatsappHealthAndAlert().catch(() => null)
  console.log(`${tag} [1/3] WhatsApp: ${waHealth?.healthy ? 'saudável' : `DEGRADADO — ${waHealth?.reason || 'erro na checagem'}`}`)

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
    // Contas pausadas (ou prestes a pausar) por falha de pagamento no cartão
    const payResult = await checkAndAlertPaymentIssues()
    console.log(`${tag} [3/3] alertas de pagamento: ${payResult.alerted.length} enviados, ${payResult.skipped.length} pulados`)
    for (const a of payResult.alerted) {
      console.log(`  → alerta de pagamento enviado para ${a.clientName} (status Meta: ${a.status})`)
    }
  } catch (err: any) {
    console.error(`${tag} [3/3] alertas de saldo falharam:`, err.message)
  }

  console.log(`${tag} ━━━━━━━━ FIM ━━━━━━━━`)
}

async function runMonthlyReport() {
  console.log(`\n[cron monthly-report] starting at ${new Date().toLocaleString('pt-BR', { timeZone: TZ })}`)
  try {
    // Chamada DIRETA (sem HTTP) — envio de 40+ clientes com pausas anti-ban leva
    // ~1h e estourava o requestTimeout de 300s do Node quando ia via fetch local.
    const result = await sendMonthlyReports()
    console.log(`[cron monthly-report] ${result.sent} enviados, ${result.skippedAlreadySent} já tinham, ${result.processed} processados`)
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

async function runCleanup() {
  const tag = '[cron cleanup]'
  console.log(`\n${tag} ━━━━━━━━ INICIO ━━━━━━━━ ${new Date().toLocaleString('pt-BR', { timeZone: TZ })}`)
  try {
    const r = await cleanOldData()
    console.log(`${tag} daily_metrics removidos: ${r.metricsDeleted} (data < ${r.metricsCutoff.toLocaleDateString('pt-BR')})`)
    console.log(`${tag} sync_logs removidos: ${r.syncLogsDeleted}`)
  } catch (err: any) {
    console.error(`${tag} falhou:`, err.message)
  }
  console.log(`${tag} ━━━━━━━━ FIM ━━━━━━━━`)
}

export function startCronJobs() {
  if (scheduled) return
  scheduled = true

  // Sync escalonado pra minimizar Disk IO (Supabase free tier):
  // - 08:00 → run COMPLETO (7 dias): pega atribuicoes recentes do Meta uma vez por dia
  // - 14:00 e 20:00 → runs LEVES (1 dia): so refrescam "hoje" enquanto o dia corre
  // Dias antigos quase nao mudam, entao reescreve-los 3x/dia era desperdicio de IO.
  // O sync profundo de sabado (60d) cobre qualquer atribuicao retroativa mais antiga.
  cron.schedule('0 8 * * *', () => runSyncAllAccounts('08:00', 7), { timezone: TZ })
  cron.schedule('0 14 * * *', () => runSyncAllAccounts('14:00-leve', 1), { timezone: TZ })
  cron.schedule('0 20 * * *', () => runSyncAllAccounts('20:00-leve', 1), { timezone: TZ })

  // Monthly report — dias 1 a 3 às 09:30. O envio é IDEMPOTENTE (pula quem já
  // recebeu), então os dias 2-3 funcionam como catch-up: se o servidor estava
  // fora do ar no dia 1 (ou o envio falhou no meio), completa nos dias seguintes.
  cron.schedule('30 9 1-3 * *', () => runMonthlyReport(), { timezone: TZ })

  // Refresh do token Meta — toda segunda às 03:00 SP. Tokens duram 60 dias,
  // então renovar semanalmente garante sempre >53 dias de validade restantes.
  cron.schedule('0 3 * * 1', () => runRefreshMetaToken(), { timezone: TZ })

  // Pré-aquece cache de grupos WhatsApp no startup (em 30s pra dar tempo do server estabilizar)
  // e revalida a cada 25 minutos pra sempre ter cache fresco (TTL é 30min).
  setTimeout(() => {
    warmGroupsCache().then((r) =>
      console.log(`[cron] groups cache warm: ${r.ok ? r.count + ' grupos' : 'falhou - ' + r.error}`)
    )
    // Checa saúde do WhatsApp no startup também (popula o cache do banner)
    checkWhatsappHealthAndAlert()
      .then((h) => console.log(`[cron] WhatsApp health (startup): ${h.healthy ? 'saudável' : 'DEGRADADO'}`))
      .catch(() => {})
  }, 30_000)
  // Checagem de saúde do WhatsApp a cada 30min (mantém o banner do dashboard fresco
  // mesmo fora dos horários de sync)
  cron.schedule('*/30 * * * *', () => { checkWhatsappHealthAndAlert().catch(() => {}) }, { timezone: TZ })
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
  cron.schedule('0 2 * * 0', () => runCleanup(), { timezone: TZ })

  console.log('[cron] scheduled: sync 08h (7d) + 14h/20h (1d leve), deep sync sábado 01:00 (60d), monthly day-1 09:30, token segunda 03:00, groups cache a cada 25min, cleanup domingo 02:00 (SP)')
}
