import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
  renderToBuffer,
} from '@react-pdf/renderer'
import { formatCurrency, formatNumber, formatPercent, formatDate } from './utils'
import { GOOGLE_CHANNEL_LABEL } from './google-channel'

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    borderBottomWidth: 2,
    borderBottomColor: '#6366f1',
    paddingBottom: 16,
  },
  agencyName: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#6366f1' },
  reportTitle: { fontSize: 11, color: '#64748b' },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#1e293b',
    marginBottom: 10,
    backgroundColor: '#f1f5f9',
    padding: '6 10',
    borderLeftWidth: 3,
    borderLeftColor: '#6366f1',
  },
  cardsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  card: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardLabel: { fontSize: 8, color: '#64748b', marginBottom: 3 },
  cardValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#1e293b' },
  table: { marginTop: 6 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#6366f1',
    padding: '6 8',
    borderRadius: 4,
  },
  tableRow: { flexDirection: 'row', padding: '5 8', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  tableRowAlt: { backgroundColor: '#f8fafc' },
  th: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#ffffff', flex: 1 },
  td: { fontSize: 8, color: '#334155', flex: 1 },
  tdBold: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1e293b', flex: 2 },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
  },
  footerText: { fontSize: 8, color: '#94a3b8' },
  observations: {
    backgroundColor: '#eff6ff',
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
    padding: 10,
    borderRadius: 4,
    marginTop: 8,
  },
  obsText: { fontSize: 9, color: '#1e40af', lineHeight: 1.5 },
})

interface ReportData {
  client: { name: string; company: string }
  period: { start: Date; end: Date }
  byPlatform?: Record<string, any>
  summary: {
    totalSpend: number
    totalImpressions: number
    totalReach?: number
    totalClicks: number
    totalLeads: number
    totalMsgConv?: number
    totalConversions: number
    avgCtr: number
    avgCpc: number
    avgCpl: number
    avgCostPerMsg?: number
    avgRoas: number | null
  }
  campaigns: {
    name: string
    platform: string
    objective?: string | null
    spend: number
    impressions: number
    reach?: number
    clicks: number
    leads: number
    msgConversations?: number
    conversions: number
    resultCount?: number
    resultLabel?: string
    ctr: number
    cpc: number
    roas: number | null
  }[]
  ads?: {
    name: string
    platform: string
    campaignName: string
    thumbnailUrl: string | null
    spend: number
    reach: number
    clicks: number
    leads: number
    msgConversations?: number
    conversions: number
    resultCount?: number
    resultLabel?: string
  }[]
  googleSearchTerms?: {
    term: string
    impressions: number
    clicks: number
    conversions: number
    cost: number
  }[]
}

function generateObservations(data: ReportData): string[] {
  const obs: string[] = []
  const { summary } = data
  const msgConv = summary.totalMsgConv || 0
  const cpm = summary.avgCostPerMsg || 0

  if (summary.avgCtr > 2)
    obs.push(`✓ CTR médio de ${formatPercent(summary.avgCtr)} está acima da média do mercado (>2%). Bom engajamento!`)
  else
    obs.push(`⚠ CTR médio de ${formatPercent(summary.avgCtr)} está abaixo de 2%. Revise os criativos.`)

  if (cpm > 0 && cpm < 20)
    obs.push(`✓ Custo por conversa de ${formatCurrency(cpm)} está eficiente.`)
  else if (cpm >= 20)
    obs.push(`⚠ Custo por conversa de ${formatCurrency(cpm)} é alto. Analise a segmentação.`)

  if (summary.avgRoas && summary.avgRoas > 3)
    obs.push(`✓ ROAS de ${summary.avgRoas.toFixed(2)}x indica boa rentabilidade das campanhas.`)

  if (msgConv > 0)
    obs.push(`${msgConv} conversas geradas no período com investimento de ${formatCurrency(summary.totalSpend)}.`)
  else if (summary.totalLeads > 0)
    obs.push(`${summary.totalLeads} leads gerados no período com investimento de ${formatCurrency(summary.totalSpend)}.`)

  return obs
}

export async function generateReportPDF(data: ReportData): Promise<Buffer> {
  const obs = generateObservations(data)

  // ── Separação por plataforma: bloco Meta quando há dados Meta;
  //    bloco Google SÓ para clientes com conta Google com atividade no período ──
  const meta = data.byPlatform?.META
  const google = data.byPlatform?.GOOGLE
  const metaCampaigns = data.campaigns.filter((c) => c.platform === 'META')
  const googleCampaigns = data.campaigns.filter((c) => c.platform === 'GOOGLE')
  const metaAds = (data.ads || []).filter((a) => a.platform === 'META')
  const hasMeta = metaCampaigns.length > 0 || (meta?.spend || 0) > 0
  const hasGoogle = googleCampaigns.length > 0 || (google?.spend || 0) > 0

  const cardsRow = (cards: { label: string; value: string }[]) =>
    React.createElement(
      View,
      { style: styles.cardsRow },
      ...cards.map((card) =>
        React.createElement(
          View,
          { style: styles.card, key: card.label },
          React.createElement(Text, { style: styles.cardLabel }, card.label),
          React.createElement(Text, { style: styles.cardValue }, card.value)
        )
      )
    )

  const doc = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },

      // Header
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.agencyName }, 'Relatório de Performance')
        ),
        React.createElement(
          View,
          { style: { alignItems: 'flex-end' } },
          React.createElement(Text, { style: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#1e293b' } }, data.client.company),
          React.createElement(Text, { style: { fontSize: 9, color: '#64748b', marginTop: 2 } }, data.client.name),
          React.createElement(Text, { style: { fontSize: 9, color: '#94a3b8', marginTop: 4 } }, `${formatDate(data.period.start)} a ${formatDate(data.period.end)}`)
        )
      ),

      // ── BLOCO META ADS — resumo ──
      ...(hasMeta ? [
        React.createElement(
          View,
          { style: styles.section },
          React.createElement(Text, { style: styles.sectionTitle }, 'META ADS — RESUMO'),
          cardsRow([
            { label: 'Investimento', value: formatCurrency(meta?.spend || 0) },
            { label: 'Conversas', value: formatNumber(meta?.msgConversations || 0) },
            { label: 'Custo por Conversa', value: (meta?.costPerMsg || 0) > 0 ? formatCurrency(meta?.costPerMsg || 0) : 'N/A' },
            { label: 'Impressões', value: formatNumber(meta?.impressions || 0) },
          ]),
          cardsRow([
            { label: 'Alcance', value: formatNumber(meta?.reach || 0) },
            { label: 'Cliques', value: formatNumber(meta?.clicks || 0) },
            { label: 'Frequência', value: (meta?.frequency || 0).toFixed(2) },
            { label: 'CTR Médio', value: formatPercent(meta?.avgCtr || 0) },
          ])
        ),
      ] : []),

      // ── BLOCO META ADS — campanhas (mesmo layout do dashboard) ──
      ...(hasMeta ? [
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, 'CAMPANHAS — META'),
        React.createElement(
          View,
          { style: styles.table },
          React.createElement(
            View,
            { style: { flexDirection: 'row', padding: '4 8', backgroundColor: '#f1f5f9', marginBottom: 2 } },
            React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 3 } }, 'CAMPANHA'),
            React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 0.8 } }, 'PLATAFORMA'),
            React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 1.4, textAlign: 'right' } }, 'RESULTADOS'),
            React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 1.2, textAlign: 'right' } }, 'CUSTO/RES.'),
            React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 0.7, textAlign: 'right' } }, 'CLIQUES'),
            React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 1, textAlign: 'right' } }, 'VALOR'),
            React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 1, textAlign: 'right' } }, 'ALCANCE')
          ),
          ...metaCampaigns.map((c, i) => {
            const rc = c.resultCount ?? c.leads
            const rl = c.resultLabel || ''
            const cpr = rc > 0 ? c.spend / rc : null
            const isMeta = c.platform === 'META'
            return React.createElement(
              View,
              {
                key: i,
                wrap: false,
                style: {
                  flexDirection: 'row', alignItems: 'center',
                  padding: '5 8', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
                  ...(i % 2 === 1 ? { backgroundColor: '#f8fafc' } : {}),
                },
              },
              React.createElement(
                Text,
                { style: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1e293b', flex: 3, paddingRight: 6 } },
                c.name
              ),
              React.createElement(
                View,
                { style: { flex: 0.8 } },
                React.createElement(
                  Text,
                  {
                    style: {
                      fontSize: 7, fontFamily: 'Helvetica-Bold',
                      color: isMeta ? '#1d4ed8' : '#b91c1c',
                      backgroundColor: isMeta ? '#dbeafe' : '#fee2e2',
                      paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6,
                      borderRadius: 8,
                      alignSelf: 'flex-start',
                    },
                  },
                  isMeta ? 'Meta' : 'Google'
                )
              ),
              React.createElement(
                View,
                { style: { flex: 1.4, alignItems: 'flex-end' } },
                React.createElement(Text, { style: { fontSize: 8, color: '#334155' } }, formatNumber(rc)),
                rl ? React.createElement(Text, { style: { fontSize: 6, color: '#94a3b8' } }, rl) : null
              ),
              React.createElement(
                View,
                { style: { flex: 1.2, alignItems: 'flex-end' } },
                React.createElement(Text, { style: { fontSize: 8, color: '#334155' } }, cpr ? formatCurrency(cpr) : '—'),
                cpr && rl ? React.createElement(Text, { style: { fontSize: 6, color: '#94a3b8' } }, `por ${rl.toLowerCase()}`) : null
              ),
              React.createElement(Text, { style: { fontSize: 8, color: '#334155', flex: 0.7, textAlign: 'right' } }, formatNumber(c.clicks)),
              React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1e293b', flex: 1, textAlign: 'right' } }, formatCurrency(c.spend)),
              React.createElement(Text, { style: { fontSize: 8, color: '#334155', flex: 1, textAlign: 'right' } }, formatNumber((c as any).reach || 0))
            )
          })
        )
      ),
      ] : []),

      // ── BLOCO META ADS — anúncios ──
      ...(hasMeta && metaAds.length > 0 ? [
        React.createElement(
          View,
          { style: styles.section, break: true },
          React.createElement(Text, { style: styles.sectionTitle }, `ANÚNCIOS NO PERÍODO (${metaAds.length})`),
          React.createElement(
            View,
            { style: { flexDirection: 'row', padding: '4 8', backgroundColor: '#f1f5f9', marginBottom: 2 } },
            React.createElement(View, { style: { width: 40 } }),
            React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 2, marginLeft: 8 } }, 'ANÚNCIO'),
            React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 1.4, textAlign: 'right' } }, 'RESULTADOS'),
            React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 1.2, textAlign: 'right' } }, 'CUSTO/RES.'),
            React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 0.8, textAlign: 'right' } }, 'CLIQUES'),
            React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 1, textAlign: 'right' } }, 'VALOR'),
            React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 1, textAlign: 'right' } }, 'ALCANCE')
          ),
          ...metaAds.map((ad, i) => {
            const rc = ad.resultCount ?? (ad.leads > 0 ? ad.leads : ad.conversions)
            const rl = ad.resultLabel || ''
            const cpr = rc > 0 ? ad.spend / rc : null
            return React.createElement(
              View,
              {
                key: i,
                wrap: false,
                style: {
                  flexDirection: 'row', alignItems: 'center',
                  padding: '5 8', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
                  ...(i % 2 === 1 ? { backgroundColor: '#f8fafc' } : {}),
                },
              },
              ad.thumbnailUrl
                ? React.createElement(Image, { src: ad.thumbnailUrl, style: { width: 36, height: 36, borderRadius: 4, objectFit: 'cover' } })
                : React.createElement(View, { style: { width: 36, height: 36, borderRadius: 4, backgroundColor: '#e2e8f0' } }),
              React.createElement(
                View,
                { style: { flex: 2, marginLeft: 8 } },
                React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1e293b' } }, ad.name.substring(0, 35)),
                React.createElement(Text, { style: { fontSize: 6, color: '#94a3b8', marginTop: 1 } }, ad.campaignName.substring(0, 40))
              ),
              React.createElement(
                View,
                { style: { flex: 1.4, alignItems: 'flex-end' } },
                React.createElement(Text, { style: { fontSize: 8, color: '#334155' } }, formatNumber(rc)),
                rl ? React.createElement(Text, { style: { fontSize: 6, color: '#94a3b8' } }, rl) : null
              ),
              React.createElement(
                View,
                { style: { flex: 1.2, alignItems: 'flex-end' } },
                React.createElement(Text, { style: { fontSize: 8, color: '#334155' } }, cpr ? formatCurrency(cpr) : '—'),
                cpr && rl ? React.createElement(Text, { style: { fontSize: 6, color: '#94a3b8' } }, `por ${rl.toLowerCase()}`) : null
              ),
              React.createElement(Text, { style: { fontSize: 8, color: '#334155', flex: 0.8, textAlign: 'right' } }, formatNumber(ad.clicks)),
              React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1e293b', flex: 1, textAlign: 'right' } }, formatCurrency(ad.spend)),
              React.createElement(Text, { style: { fontSize: 8, color: '#334155', flex: 1, textAlign: 'right' } }, formatNumber(ad.reach))
            )
          })
        )
      ] : []),

      // ── BLOCO GOOGLE ADS — só aparece se o cliente tem Google com dados no período ──
      ...(hasGoogle ? [
        React.createElement(
          View,
          { style: styles.section, break: hasMeta },
          React.createElement(Text, { style: { ...styles.sectionTitle, borderLeftColor: '#ea4335' } }, 'GOOGLE ADS — RESUMO'),
          cardsRow([
            { label: 'Investimento', value: formatCurrency(google?.spend || 0) },
            { label: 'Conversões', value: formatNumber(google?.conversions || 0) },
            { label: 'Custo por Conversão', value: (google?.costPerConv || 0) > 0 ? formatCurrency(google?.costPerConv || 0) : 'N/A' },
          ]),
          cardsRow([
            { label: 'Cliques', value: formatNumber(google?.clicks || 0) },
            { label: 'CPC Médio', value: formatCurrency(google?.avgCpc || 0) },
            { label: 'CTR Médio', value: formatPercent(google?.avgCtr || 0) },
          ])
        ),
        React.createElement(
          View,
          { style: styles.section },
          React.createElement(Text, { style: { ...styles.sectionTitle, borderLeftColor: '#ea4335' } }, 'CAMPANHAS — GOOGLE'),
          React.createElement(
            View,
            { style: styles.table },
            React.createElement(
              View,
              { style: { flexDirection: 'row', padding: '4 8', backgroundColor: '#f1f5f9', marginBottom: 2 } },
              React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 3 } }, 'CAMPANHA'),
              React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 1.3 } }, 'OBJETIVO'),
              React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 1.1, textAlign: 'right' } }, 'INVESTIMENTO'),
              React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 0.8, textAlign: 'right' } }, 'CLIQUES'),
              React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 0.9, textAlign: 'right' } }, 'CPC'),
              React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 1, textAlign: 'right' } }, 'CONVERSÕES'),
              React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 1.1, textAlign: 'right' } }, 'CUSTO/CONV.')
            ),
            ...googleCampaigns.map((c, i) => {
              const cpc = c.clicks > 0 ? c.spend / c.clicks : null
              const costConv = c.conversions > 0 ? c.spend / c.conversions : null
              const channel = c.objective ? (GOOGLE_CHANNEL_LABEL[c.objective] || c.objective) : '—'
              return React.createElement(
                View,
                {
                  key: i,
                  wrap: false,
                  style: {
                    flexDirection: 'row', alignItems: 'center',
                    padding: '5 8', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
                    ...(i % 2 === 1 ? { backgroundColor: '#f8fafc' } : {}),
                  },
                },
                React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1e293b', flex: 3, paddingRight: 6 } }, c.name),
                React.createElement(Text, { style: { fontSize: 7, color: '#64748b', flex: 1.3 } }, channel),
                React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1e293b', flex: 1.1, textAlign: 'right' } }, formatCurrency(c.spend)),
                React.createElement(Text, { style: { fontSize: 8, color: '#334155', flex: 0.8, textAlign: 'right' } }, formatNumber(c.clicks)),
                React.createElement(Text, { style: { fontSize: 8, color: '#334155', flex: 0.9, textAlign: 'right' } }, cpc != null ? formatCurrency(cpc) : '—'),
                React.createElement(Text, { style: { fontSize: 8, color: '#334155', flex: 1, textAlign: 'right' } }, formatNumber(c.conversions)),
                React.createElement(Text, { style: { fontSize: 8, color: '#334155', flex: 1.1, textAlign: 'right' } }, costConv != null ? formatCurrency(costConv) : '—')
              )
            })
          )
        ),

        // ── Palavras-chave mais pesquisadas (Google) — só se houver termos no período ──
        ...((data.googleSearchTerms?.length || 0) > 0 ? [
          React.createElement(
            View,
            { style: styles.section },
            React.createElement(Text, { style: { ...styles.sectionTitle, borderLeftColor: '#ea4335' } }, 'PALAVRAS-CHAVE MAIS PESQUISADAS — GOOGLE'),
            React.createElement(Text, { style: { fontSize: 8, color: '#94a3b8', marginTop: -4, marginBottom: 6 } }, 'Termos que as pessoas digitaram no Google e acionaram seus anúncios de Pesquisa no período.'),
            React.createElement(
              View,
              { style: styles.table },
              React.createElement(
                View,
                { style: { flexDirection: 'row', padding: '4 8', backgroundColor: '#f1f5f9', marginBottom: 2 } },
                React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 3 } }, 'TERMO PESQUISADO'),
                React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 1, textAlign: 'right' } }, 'IMPRESSÕES'),
                React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 0.8, textAlign: 'right' } }, 'CLIQUES'),
                React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 0.7, textAlign: 'right' } }, 'CTR'),
                React.createElement(Text, { style: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#64748b', flex: 1, textAlign: 'right' } }, 'CONVERSÕES')
              ),
              ...(data.googleSearchTerms || []).map((t, i) => {
                const ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0
                return React.createElement(
                  View,
                  {
                    key: i,
                    wrap: false,
                    style: {
                      flexDirection: 'row', alignItems: 'center',
                      padding: '5 8', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
                      ...(i % 2 === 1 ? { backgroundColor: '#f8fafc' } : {}),
                    },
                  },
                  React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1e293b', flex: 3, paddingRight: 6 } }, t.term),
                  React.createElement(Text, { style: { fontSize: 8, color: '#334155', flex: 1, textAlign: 'right' } }, formatNumber(t.impressions)),
                  React.createElement(Text, { style: { fontSize: 8, color: '#334155', flex: 0.8, textAlign: 'right' } }, formatNumber(t.clicks)),
                  React.createElement(Text, { style: { fontSize: 8, color: '#334155', flex: 0.7, textAlign: 'right' } }, formatPercent(ctr)),
                  React.createElement(Text, { style: { fontSize: 8, color: '#334155', flex: 1, textAlign: 'right' } }, formatNumber(t.conversions))
                )
              })
            )
          ),
        ] : []),
      ] : []),

      // Observations
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, 'ANÁLISE DE PERFORMANCE'),
        React.createElement(
          View,
          { style: styles.observations },
          ...obs.map((o, i) =>
            React.createElement(Text, { style: { ...styles.obsText, marginBottom: i < obs.length - 1 ? 6 : 0 }, key: i }, o)
          )
        )
      ),

      // Footer
      React.createElement(
        View,
        { style: styles.footer },
        React.createElement(Text, { style: styles.footerText }, `Gerado em ${formatDate(new Date())}`),
        React.createElement(Text, { style: styles.footerText }, 'Dados extraídos das plataformas de anúncios')
      )
    )
  )

  return await renderToBuffer(doc)
}
