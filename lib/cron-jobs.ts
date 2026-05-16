import cron from 'node-cron'
import { prisma } from './prisma'
import { syncMetaAccount } from './meta-ads'
import { syncGoogleAccount } from './google-ads'

// Runs scheduled jobs in-process while the Next.js server is up.
// Timezone is fixed to São Paulo so the schedule matches the user's day.
const TZ = 'America/Sao_Paulo'

let scheduled = false

async function runSyncAllAccounts(triggerLabel: string) {
  console.log(`\n[cron ${triggerLabel}] sync started at ${new Date().toLocaleString('pt-BR', { timeZone: TZ })}`)
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

export function startCronJobs() {
  if (scheduled) return
  scheduled = true

  // Sync 3x per day — 08:00, 14:00, 20:00 (São Paulo)
  cron.schedule('0 8 * * *', () => runSyncAllAccounts('08:00'), { timezone: TZ })
  cron.schedule('0 14 * * *', () => runSyncAllAccounts('14:00'), { timezone: TZ })
  cron.schedule('0 20 * * *', () => runSyncAllAccounts('20:00'), { timezone: TZ })

  // Monthly report — day 1 at 08:30 (gives the 08:00 sync time to finish first)
  cron.schedule('30 8 1 * *', () => runMonthlyReport(), { timezone: TZ })

  console.log('[cron] scheduled: sync 08:00/14:00/20:00, monthly-report day-1 08:30 (America/Sao_Paulo)')
}
