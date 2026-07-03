import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDateRange, formatDate } from '@/lib/utils'
import { computeClientMetrics } from '@/lib/metrics'

export const maxDuration = 120

const bodySchema = z.object({
  clientId: z.string().min(1),
  period: z.enum(['today', 'yesterday', 'last7days', 'last30days', 'thisMonth', 'lastMonth']).default('last30days'),
})

const cacheKey = (clientId: string, period: string) => `ai_analysis:${clientId}:${period}`

// Prompt de sistema ESTÁVEL (congelado) — qualquer conteúdo dinâmico vai no turno de
// usuário, depois do breakpoint de cache, pra não invalidar o prefixo cacheado.
const SYSTEM_PROMPT = `Você é um gestor de tráfego pago sênior, especialista em Meta Ads e Google Ads, analisando a conta de um cliente de uma agência brasileira (varejo: colchões, móveis, estofados e similares — tráfego local com foco em conversas no WhatsApp e conversões).

Você receberá um JSON com as métricas do período: resumos por plataforma, campanhas (com gasto, resultados, custo por resultado, CTR) e melhores/piores anúncios.

Produza uma análise em português do Brasil, direta e prática, no formato EXATO abaixo (títulos em maiúsculas, bullets com "•", SEM markdown — nada de asteriscos, cerquilhas ou tabelas):

RESUMO
2 a 3 frases sobre o estado geral da conta no período: investimento, resultado principal e tendência.

DESTAQUES
• 2 a 4 pontos positivos concretos, citando nomes de campanhas/anúncios e números.

PONTOS DE ATENÇÃO
• 2 a 4 problemas ou riscos concretos, citando nomes e números (ex: campanha com CPR muito acima da média, anúncio queimado com frequência alta, conta sem veiculação).

RECOMENDAÇÕES
• 3 a 5 ações práticas e priorizadas que o gestor pode executar essa semana (realocação de verba entre campanhas citadas, pausar/escalar anúncios específicos, testar criativo novo, ajustar orçamento). Seja específico: diga O QUE fazer e ONDE.

Regras:
- Baseie TUDO nos dados fornecidos; nunca invente números.
- Compare custo por resultado entre campanhas pra fundamentar recomendações.
- Se houver Google Ads nos dados, analise separadamente do Meta.
- Se os dados forem escassos (pouco gasto/poucos dias), diga isso com honestidade e reduza o número de bullets.
- Tom: direto, de gestor pra gestor. Sem introduções ("Olá", "Segue análise") e sem despedidas.`

async function getClientOr404(clientId: string) {
  return prisma.client.findUnique({ where: { id: clientId }, select: { id: true, company: true } })
}

// GET /api/analysis?clientId=..&period=.. — retorna a última análise cacheada (se houver)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const parsed = bodySchema.safeParse({
    clientId: url.searchParams.get('clientId') || '',
    period: url.searchParams.get('period') || 'last30days',
  })
  if (!parsed.success) return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })

  const stored = await prisma.appSettings.findUnique({
    where: { key: cacheKey(parsed.data.clientId, parsed.data.period) },
  })
  if (!stored) return NextResponse.json({ analysis: null })
  try {
    return NextResponse.json({ analysis: JSON.parse(stored.value) })
  } catch {
    return NextResponse.json({ analysis: null })
  }
}

// POST /api/analysis — gera uma análise nova com Claude e cacheia
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY não configurada no ambiente. Crie uma chave em console.anthropic.com e adicione no EasyPanel.' },
      { status: 400 }
    )
  }

  let body: unknown
  try { body = await req.json() } catch { body = {} }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  const { clientId, period } = parsed.data

  const client = await getClientOr404(clientId)
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const { start, end } = getDateRange(period)
  const m = await computeClientMetrics({ clientId, start, end })

  // Payload compacto — só o que a análise precisa, pra economizar tokens
  const campaigns = (m.campaigns || []).slice(0, 15).map((c: any) => ({
    nome: c.name,
    plataforma: c.platform,
    status: c.status,
    objetivo: c.objective || null,
    gasto: Math.round(c.spend * 100) / 100,
    cliques: c.clicks,
    resultados: c.resultCount ?? null,
    tipoResultado: c.resultLabel || null,
    custoPorResultado: c.cpr != null ? Math.round(c.cpr * 100) / 100 : null,
    ctr: Math.round((c.ctr || 0) * 100) / 100,
  }))

  const adsRanked = (m.ads || []).filter((a: any) => a.platform === 'META' && a.cpr != null)
  const sortedAds = [...adsRanked].sort((a: any, b: any) => a.cpr - b.cpr)
  const mapAd = (a: any) => ({
    nome: a.name,
    campanha: a.campaignName,
    status: a.status,
    gasto: Math.round(a.spend * 100) / 100,
    resultados: a.resultCount ?? null,
    tipoResultado: a.resultLabel || null,
    custoPorResultado: Math.round(a.cpr * 100) / 100,
  })

  const dados = {
    cliente: client.company,
    periodo: { inicio: formatDate(start), fim: formatDate(end), filtro: period },
    resumoPorPlataforma: m.byPlatform,
    campanhas: campaigns,
    melhoresAnuncios: sortedAds.slice(0, 5).map(mapAd),
    pioresAnuncios: sortedAds.slice(-3).reverse().map(mapAd),
    contas: (m.accounts || []).map((a: any) => ({
      nome: a.accountName, plataforma: a.platform, ativa: a.active,
      formaPagamento: a.fundingType, saldo: a.balance,
    })),
  }

  const anthropic = new Anthropic()

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          // Breakpoint de cache no prompt estável. Obs: o mínimo cacheável do Opus 4.8
          // é 4096 tokens — abaixo disso o marcador é inofensivo (não cacheia, não cobra).
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Dados do período:\n${JSON.stringify(dados, null, 1)}`,
        },
      ],
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    if (!text) {
      return NextResponse.json({ error: 'A análise veio vazia — tente novamente.' }, { status: 502 })
    }

    const analysis = { text, generatedAt: new Date().toISOString(), period }
    await prisma.appSettings.upsert({
      where: { key: cacheKey(clientId, period) },
      update: { value: JSON.stringify(analysis) },
      create: { key: cacheKey(clientId, period), value: JSON.stringify(analysis) },
    })

    return NextResponse.json({ analysis })
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY inválida — confira a chave no EasyPanel.' }, { status: 400 })
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'Limite de requisições da API atingido — tente de novo em instantes.' }, { status: 429 })
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Erro na API da Anthropic: ${err.message}` }, { status: 502 })
    }
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: `Falha ao gerar análise: ${msg}` }, { status: 500 })
  }
}
