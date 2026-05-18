import { prisma } from './prisma'
import { sendTextMessage } from './evolution-api'

const TOKEN_ALERT_COOLDOWN_HOURS = 24

// Códigos de erro do Meta Graph API que indicam problema de token (precisa renovar manualmente)
// Docs: https://developers.facebook.com/docs/graph-api/guides/error-handling
const META_TOKEN_ERROR_CODES = new Set([
  102,  // Session has expired
  190,  // Invalid OAuth access token (expirado, revogado, mudou senha)
  463,  // Token has expired (variante)
  467,  // Invalid access token
])

export function isMetaTokenError(err: any): boolean {
  if (!err?.response) return false
  const status = err.response.status
  const code = err.response.data?.error?.code
  if (status === 401) return true
  if ((status === 400 || status === 403) && code != null && META_TOKEN_ERROR_CODES.has(Number(code))) return true
  return false
}

export function extractMetaErrorMessage(err: any): string {
  const code = err?.response?.data?.error?.code
  const message = err?.response?.data?.error?.message
  if (message) return `[${code}] ${message}`
  return err?.message || 'Erro desconhecido'
}

// Marca a conta como com erro de token e dispara alerta no WhatsApp (se configurado)
// O cooldown evita spam — só alerta 1x por 24h por conta.
export async function markTokenError(adAccountId: string, err: any): Promise<void> {
  const errorMessage = extractMetaErrorMessage(err)

  const account = await prisma.adAccount.findUnique({
    where: { id: adAccountId },
    include: { client: { select: { company: true } } },
  })
  if (!account) return

  await prisma.adAccount.update({
    where: { id: adAccountId },
    data: {
      tokenError: errorMessage,
      tokenErrorAt: new Date(),
    },
  })

  // Decide se deve alertar (cooldown de 24h)
  const cooldownMs = TOKEN_ALERT_COOLDOWN_HOURS * 60 * 60 * 1000
  const now = Date.now()
  if (account.lastTokenAlert && now - account.lastTokenAlert.getTime() < cooldownMs) {
    console.warn(`[token-alert] ${account.accountName}: ${errorMessage} (em cooldown, sem alerta)`)
    return
  }

  console.error(`[token-alert] TOKEN EXPIRADO: ${account.accountName} (${account.client.company}) — ${errorMessage}`)

  const adminGroup = process.env.ADMIN_WHATSAPP_GROUP
  if (adminGroup) {
    const message =
      `🚨 *Token Meta expirado/inválido*\n\n` +
      `Cliente: *${account.client.company}*\n` +
      `Conta: *${account.accountName}*\n` +
      `Erro: ${errorMessage}\n\n` +
      `O sync dessa conta vai falhar até você renovar o token Meta nas configurações.\n` +
      `Acesse o app pra mais detalhes.`

    try {
      await sendTextMessage(adminGroup, message)
      await prisma.adAccount.update({
        where: { id: adAccountId },
        data: { lastTokenAlert: new Date() },
      })
    } catch (e: any) {
      console.error('[token-alert] falha ao notificar admin:', e.message)
    }
  }
}

// Limpa o status de erro quando o sync funciona (chamado no início de cada sync bem-sucedido)
export async function clearTokenError(adAccountId: string): Promise<void> {
  const account = await prisma.adAccount.findUnique({
    where: { id: adAccountId },
    select: { tokenError: true },
  })
  if (account?.tokenError) {
    await prisma.adAccount.update({
      where: { id: adAccountId },
      data: { tokenError: null, tokenErrorAt: null },
    })
  }
}
