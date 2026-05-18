import { prisma } from './prisma'
import { sendTextMessage } from './evolution-api'
import { formatCurrency } from './utils'

const LOW_BALANCE_THRESHOLD = 100  // R$
const ALERT_COOLDOWN_HOURS = 24    // não alertar a mesma conta mais de 1x por 24h

// Percorre todas as contas pré-pagas, alerta clientes cujo saldo caiu abaixo do limite.
// Respeita cooldown de 24h pra não floodar o WhatsApp do cliente.
// Retorna lista de alertas enviados.
export async function checkAndAlertLowBalances(): Promise<{
  checked: number
  alerted: { accountId: string; clientName: string; balance: number }[]
  skipped: { accountId: string; reason: string }[]
}> {
  const accounts = await prisma.adAccount.findMany({
    where: {
      platform: 'META',
      active: true,
      fundingType: 'prepaid',
      balance: { not: null, lt: LOW_BALANCE_THRESHOLD },
    },
    include: {
      client: { select: { id: true, name: true, company: true, whatsappGroup: true } },
    },
  })

  const alerted: { accountId: string; clientName: string; balance: number }[] = []
  const skipped: { accountId: string; reason: string }[] = []
  const cooldownMs = ALERT_COOLDOWN_HOURS * 60 * 60 * 1000
  const now = Date.now()

  for (const account of accounts) {
    if (!account.client.whatsappGroup) {
      skipped.push({ accountId: account.id, reason: 'sem WhatsApp configurado' })
      continue
    }

    if (account.lastLowBalanceAlert && now - account.lastLowBalanceAlert.getTime() < cooldownMs) {
      skipped.push({ accountId: account.id, reason: 'em cooldown (já alertado nas últimas 24h)' })
      continue
    }

    const balance = account.balance || 0
    const company = account.client.company
    const message =
      `⚠️ *Alerta de Saldo Baixo*\n\n` +
      `Olá! O saldo da sua conta de anúncios *${account.accountName}* está em:\n\n` +
      `💰 *${formatCurrency(balance)}*\n\n` +
      `Recomendamos adicionar saldo o quanto antes para que seus anúncios não sejam pausados.\n\n` +
      `Qualquer dúvida estou à disposição!`

    try {
      await sendTextMessage(account.client.whatsappGroup, message)

      await prisma.adAccount.update({
        where: { id: account.id },
        data: { lastLowBalanceAlert: new Date() },
      })

      await prisma.whatsappSend.create({
        data: {
          clientId: account.client.id,
          groupId: account.client.whatsappGroup,
          message,
          status: 'SENT',
          type: 'low_balance_alert',
          sentAt: new Date(),
        },
      })

      alerted.push({ accountId: account.id, clientName: company, balance })
    } catch (err: any) {
      await prisma.whatsappSend.create({
        data: {
          clientId: account.client.id,
          groupId: account.client.whatsappGroup,
          message,
          status: 'ERROR',
          type: 'low_balance_alert',
          errorMessage: err.message,
        },
      })
      skipped.push({ accountId: account.id, reason: `erro ao enviar: ${err.message}` })
    }
  }

  return { checked: accounts.length, alerted, skipped }
}
