import { prisma } from './prisma'
import { countActiveCreatives, getMetaErrorMessage } from './meta-ads'
import { sendDocumentMessage } from './evolution-api'
import { generateClientMomentPDF } from './client-moment-pdf'
import { getDateRange } from './utils'

// "Momento do Cliente": tabela interna da equipe com, por loja, criativos ativos
// (campanha de WhatsApp / visibilidade no perfil do Instagram), custo por lead das
// campanhas de mensagens e a qualidade dos criativos avaliada pelo gestor.
// Enviada em PDF toda quarta às 09:30 (últimos 7 dias completos) para o grupo da equipe.

export const CREATIVE_QUALITIES = ['Ótimo', 'Bom', 'Regular', 'Ruim'] as const

export const MOMENT_PERIODS = ['last7full', 'thisMonth', 'lastMonth'] as const
export type MomentPeriod = (typeof MOMENT_PERIODS)[number]

export const MOMENT_PERIOD_LABEL: Record<MomentPeriod, string> = {
  last7full: 'Últimos 7 dias',
  thisMonth: 'Este mês',
  lastMonth: 'Mês passado',
}

export function getMomentRange(period: MomentPeriod): { start: Date; end: Date } {
  if (period === 'last7full') {
    // 7 dias COMPLETOS até ontem (igual ao "Últimos 7 dias" do Gerenciador) — às 09:30
    // o dia de hoje ainda está praticamente vazio e puxaria o custo por lead pra baixo
    const today = getDateRange('today').start
    return { start: getDateRange('last7days').start, end: new Date(today.getTime() - 1) }
  }
  return getDateRange(period)
}

// As fronteiras ficam ancoradas em meia-noite UTC (ver spMidnight em utils), então o
// dia certo é o componente UTC — formatDate (fuso SP) mostraria o dia anterior.
export function formatMomentDay(d: Date): string {
  return d.toISOString().slice(0, 10).split('-').reverse().join('/')
}

export interface MomentRow {
  clientId: string
  company: string
  included: boolean // selecionada para o relatório (PDF / envio de quarta)
  quality: string | null
  activeWhatsapp: number | null // null = não foi possível consultar o Meta agora
  activeInstagram: number | null
  ranWhatsapp: number // criativos com veiculação no período (inclui os já pausados)
  ranInstagram: number
  spend: number // só campanhas de mensagens (WhatsApp)
  conversations: number
  cpl: number | null
  error?: string
}

const isWhatsapp = (dest: string | null | undefined) => !!dest && dest.includes('WHATSAPP')
const isInstagramProfile = (dest: string | null | undefined) => dest === 'INSTAGRAM_PROFILE'

// A aba mostra todos os clientes ativos (cada um com o seu "incluir no relatório");
// o PDF e o envio de quarta usam onlyIncluded para levar só as lojas selecionadas.
export async function buildClientMoment(start: Date, end: Date, { onlyIncluded = false } = {}): Promise<MomentRow[]> {
  const clients = await prisma.client.findMany({
    where: { active: true, ...(onlyIncluded ? { momentEnabled: true } : {}) },
    select: {
      id: true,
      company: true,
      momentEnabled: true,
      creativeQuality: true,
      adAccounts: { where: { platform: 'META', active: true }, select: { id: true } },
    },
  })
  const clientIds = clients.map((c) => c.id)

  // Custo por lead: SOMENTE campanhas de mensagens (destino WhatsApp). O investimento em
  // visibilidade (perfil do Instagram) e posts impulsionados não entra na conta.
  const [msgMetrics, adMetrics] = await Promise.all([
    prisma.dailyMetric.findMany({
      where: {
        date: { gte: start, lte: end },
        campaign: { destinationType: { contains: 'WHATSAPP' }, adAccount: { clientId: { in: clientIds }, platform: 'META' } },
      },
      select: { spend: true, msgConversations: true, leads: true, campaign: { select: { adAccount: { select: { clientId: true } } } } },
    }),
    prisma.dailyMetric.findMany({
      where: {
        date: { gte: start, lte: end },
        impressions: { gt: 0 },
        ad: { adSet: { campaign: { adAccount: { clientId: { in: clientIds }, platform: 'META' } } } },
      },
      distinct: ['adId'],
      select: { ad: { select: { adSet: { select: { campaign: { select: { destinationType: true, adAccount: { select: { clientId: true } } } } } } } } },
    }),
  ])

  const msg = new Map<string, { spend: number; conversations: number }>()
  for (const m of msgMetrics) {
    const clientId = m.campaign!.adAccount.clientId
    const acc = msg.get(clientId) || { spend: 0, conversations: 0 }
    acc.spend += m.spend
    acc.conversations += m.msgConversations || m.leads
    msg.set(clientId, acc)
  }

  const ran = new Map<string, { whatsapp: number; instagram: number }>()
  for (const m of adMetrics) {
    const campaign = m.ad!.adSet.campaign
    const acc = ran.get(campaign.adAccount.clientId) || { whatsapp: 0, instagram: 0 }
    if (isWhatsapp(campaign.destinationType)) acc.whatsapp++
    else if (isInstagramProfile(campaign.destinationType)) acc.instagram++
    ran.set(campaign.adAccount.clientId, acc)
  }

  // Criativos ativos agora: consulta ao vivo no Meta, em lotes pra não estourar o rate limit
  const active = new Map<string, { whatsapp: number; instagram: number } | { error: string }>()
  for (let i = 0; i < clients.length; i += 6) {
    await Promise.all(
      clients.slice(i, i + 6).map(async (c) => {
        try {
          const counts = await Promise.all(c.adAccounts.map((a) => countActiveCreatives(a.id)))
          active.set(c.id, {
            whatsapp: counts.reduce((s, x) => s + x.whatsapp, 0),
            instagram: counts.reduce((s, x) => s + x.instagramProfile, 0),
          })
        } catch (err) {
          active.set(c.id, { error: getMetaErrorMessage(err) })
        }
      })
    )
  }

  return clients
    .map((c) => {
      const m = msg.get(c.id) || { spend: 0, conversations: 0 }
      const r = ran.get(c.id) || { whatsapp: 0, instagram: 0 }
      const a = active.get(c.id)
      const failed = !a || 'error' in a
      return {
        clientId: c.id,
        company: c.company.trim(),
        included: c.momentEnabled,
        quality: c.creativeQuality,
        activeWhatsapp: failed ? null : a.whatsapp,
        activeInstagram: failed ? null : a.instagram,
        ranWhatsapp: r.whatsapp,
        ranInstagram: r.instagram,
        spend: m.spend,
        conversations: m.conversations,
        cpl: m.conversations > 0 ? m.spend / m.conversations : null,
        ...(a && 'error' in a ? { error: a.error } : {}),
      }
    })
    .sort((x, y) => x.company.localeCompare(y.company, 'pt-BR', { numeric: true, sensitivity: 'base' }))
}

// ── Grupo de destino do envio semanal (configurável na aba) ──
const GROUP_KEY = 'client_moment_group' // JSON { id, name }
const LAST_SENT_KEY = 'client_moment_last_sent' // início do período do último envio automático

export async function getMomentGroup(): Promise<{ id: string; name: string } | null> {
  const row = await prisma.appSettings.findUnique({ where: { key: GROUP_KEY } })
  if (!row) return null
  try {
    return JSON.parse(row.value)
  } catch {
    return null
  }
}

export async function setMomentGroup(group: { id: string; name: string }): Promise<void> {
  const value = JSON.stringify(group)
  await prisma.appSettings.upsert({ where: { key: GROUP_KEY }, update: { value }, create: { key: GROUP_KEY, value } })
}

export async function buildClientMomentPDF(period: MomentPeriod) {
  const { start, end } = getMomentRange(period)
  const rows = await buildClientMoment(start, end, { onlyIncluded: true })
  const pdf = await generateClientMomentPDF(rows, { start, end, periodLabel: MOMENT_PERIOD_LABEL[period] })
  return { pdf, rows, start, end, filename: `momento-do-cliente-${start.toISOString().slice(0, 10)}.pdf` }
}

// Envio dos últimos 7 dias completos para o grupo configurado. O cron passa
// manual=false: se o mesmo período já foi enviado (ex: servidor reiniciou), pula.
export async function sendClientMoment({ manual = false } = {}): Promise<{ sent: boolean; reason?: string; rows?: number; group?: string }> {
  const group = await getMomentGroup()
  if (!group) return { sent: false, reason: 'Nenhum grupo de WhatsApp configurado na aba Momento do Cliente' }

  const { start, end } = getMomentRange('last7full')
  const periodKey = start.toISOString().slice(0, 10)
  if (!manual) {
    const last = await prisma.appSettings.findUnique({ where: { key: LAST_SENT_KEY } })
    if (last?.value === periodKey) return { sent: false, reason: 'Período já enviado' }
  }

  const { pdf, rows, filename } = await buildClientMomentPDF('last7full')
  const caption = `📊 *Momento do Cliente Semanal*\n📅 ${formatMomentDay(start)} a ${formatMomentDay(end)}\n\n${rows.length} lojas · custo por lead só das campanhas de mensagens.`
  await sendDocumentMessage(group.id, pdf.toString('base64'), filename, caption)

  await prisma.appSettings.upsert({
    where: { key: LAST_SENT_KEY },
    update: { value: periodKey },
    create: { key: LAST_SENT_KEY, value: periodKey },
  })
  return { sent: true, rows: rows.length, group: group.name }
}
