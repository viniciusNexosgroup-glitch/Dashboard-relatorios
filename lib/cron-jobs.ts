import cron from 'node-cron'
import { prisma } from './prisma'
import { syncMetaAccount } from './meta-ads'
import { syncGoogleAccount } from './google-ads'
import { checkAndAlertLowBalances } from './balance-alerts'
import { refreshMetaTokenIfNearExpiry } from './meta-token'

// Runs scheduled jobs in-process while the Next.js server is up.
// Timezone is fixed to São Paulo so the schedule matches the user's day.
const TZ = 'America/Sao_Paulo'

let scheduled = false

async function runSyncAllAccounts(triggerLabel: string) {
  console.log(`\n[cron ${triggerLabel}] sync started at ${new Date().toLocaleString('pt-BR', { timeZone: TZ })}`)

  // Antes de sincronizar contas: garante que o token Meta tá fresco
  // (renova se faltar < 14 dias pra expirar)
  try {
    const tokenResult = await refreshMetaTokenIfNearExpiry()
    if (tokenResult.refreshed) {
      console.log(`[cron ${triggerLabel}] token Meta renovado, vale até ${tokenResult.expiresAt?.toISOString()}`)
    }
  } catch (err: any) {
    console.error(`[cron ${triggerLabel}] check de token falhou:`, err.message)
  }

  const accounts = await prisma.adAccount.findMany({ where: { active: true } })
  let ok = 0, fail = 0
  for (const account of accounts) {
    try {
      if (account.platform === 'META') await syncMetaAccount(account.id)
      else await syncGoogleAccount(account.id)
      ok++
    } catch (err: any) {
      console.error(`[cron ${triggerLabel}] sync error ${account.id}:`, err.message)
      fail++
    }
  }
  console.log(`[cron ${triggerLabel}] sync done: ${ok} ok, ${fail} fail`)

  // Após sincronizar, verifica saldos baixos e alerta clientes
  try {
    const alertResult = await checkAndAlertLowBalances()
    console.log(`[cron ${triggerLabel}] balance alerts: ${alertResult.alerted.length} enviados, ${alertResult.skipped.length} pulados`)
    for (const a of alertResult.alerted) {
      console.log(`  → alerta enviado para ${a.clientName} (saldo: R$ ${a.balance.toFixed(2)})`)
    }
  } catch (err: any) {
    console.error(`[cron ${triggerLabel}] balance alerts failed:`, err.message)
  }
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

  console.log('[cron] scheduled: sync 08:00/14:00/20:00, monthly-report day-1 09:30, refresh-meta-token segunda 03:00 (America/Sao_Paulo)')
}
