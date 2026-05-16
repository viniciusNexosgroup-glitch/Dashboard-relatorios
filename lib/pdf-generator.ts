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
    spend: number
    impressions: number
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
  const agencyName = process.env.NEXT_PUBLIC_AGENCY_NAME || 'Agência'

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
          React.createElement(Text, { style: styles.agencyName }, agencyName),
          React.createElement(Text, { style: { fontSize: 9, color: '#64748b', marginTop: 2 } }, 'Relatório de Performance')
        ),
        React.createElement(
          View,
          { style: { alignItems: 'flex-end' } },
          React.createElement(Text, { style: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#1e293b' } }, data.client.company),
          React.createElement(Text, { style: { fontSize: 9, color: '#64748b', marginTop: 2 } }, data.client.name),
          React.createElement(Text, { style: { fontSize: 9, color: '#94a3b8', marginTop: 4 } }, `${formatDate(data.period.start)} a ${formatDate(data.period.end)}`)
        )
      ),

      // Summary Cards
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, 'RESUMO GERAL'),
        React.createElement(
          View,
          { style: styles.cardsRow },
          ...[
            { label: 'Investimento Total', value: formatCurrency(data.summary.totalSpend) },
            { label: 'Impressões', value: formatNumber(data.summary.totalImpressions) },
            { label: 'Cliques', value: formatNumber(data.summary.totalClicks) },
            { label: 'Conversas', value: formatNumber(data.summary.totalMsgConv || 0) },
          ].map((card) =>
            React.createElement(
              View,
              { style: styles.card, key: card.label },
              React.createElement(Text, { style: styles.cardLabel }, card.label),
              React.createElement(Text, { style: styles.cardValue }, card.value)
            )
          )
        ),
        React.createElement(
          View,
          { style: styles.cardsRow },
          ...[
            { label: 'Alcance', value: formatNumber((data.summary as any).totalReach || 0) },
            { label: 'CTR Médio', value: formatPercent(data.summary.avgCtr) },
            { label: 'CPC Médio', value: formatCurrency(data.summary.avgCpc) },
            { label: 'Custo por Conversa', value: (data.summary.avgCostPerMsg || 0) > 0 ? formatCurrency(data.summary.avgCostPerMsg!) : 'N/A' },
          ].map((card) =>
            React.createElement(
              View,
              { style: styles.card, key: card.label },
              React.createElement(Text, { style: styles.cardLabel }, card.label),
              React.createElement(Text, { style: styles.cardValue }, card.value)
            )
          )
        )
      ),

      // Campaigns Table
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, 'PRINCIPAIS CAMPANHAS'),
        React.createElement(
          View,
          { style: styles.table },
          React.createElement(
            View,
            { style: styles.tableHeader },
            React.createElement(Text, { style: { ...styles.th, flex: 2 } }, 'Campanha'),
            React.createElement(Text, { style: styles.th }, 'Invest.'),
            React.createElement(Text, { style: styles.th }, 'Cliques'),
            React.createElement(Text, { style: { ...styles.th, flex: 1.5 } }, 'Resultados'),
            React.createElement(Text, { style: { ...styles.th, flex: 1.2 } }, 'Custo/Result.'),
            React.createElement(Text, { style: styles.th }, 'CTR')
          ),
          ...data.campaigns.slice(0, 12).map((c, i) => {
            const rc = c.resultCount ?? c.leads
            const rl = c.resultLabel || ''
            const cpr = rc > 0 ? c.spend / rc : null
            return React.createElement(
              View,
              { style: i % 2 === 1 ? { ...styles.tableRow, ...styles.tableRowAlt } : styles.tableRow, key: i },
              React.createElement(
                View,
                { style: { flex: 2 } },
                React.createElement(Text, { style: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1e293b' } }, c.name.substring(0, 32)),
                React.createElement(Text, { style: { fontSize: 7, color: '#94a3b8' } }, c.platform === 'META' ? 'Meta' : 'Google')
              ),
              React.createElement(Text, { style: { ...styles.td, fontFamily: 'Helvetica-Bold' } }, formatCurrency(c.spend)),
              React.createElement(Text, { style: styles.td }, formatNumber(c.clicks)),
              React.createElement(
                View,
                { style: { flex: 1.5 } },
                React.createElement(Text, { style: { fontSize: 8, color: '#334155' } }, formatNumber(rc)),
                rl ? React.createElement(Text, { style: { fontSize: 6, color: '#94a3b8' } }, rl) : null
              ),
              React.createElement(
                View,
                { style: { flex: 1.2 } },
                React.createElement(Text, { style: { fontSize: 8, color: '#334155' } }, cpr ? formatCurrency(cpr) : '—'),
                cpr && rl ? React.createElement(Text, { style: { fontSize: 6, color: '#94a3b8' } }, `por ${rl.toLowerCase()}`) : null
              ),
              React.createElement(Text, { style: styles.td }, formatPercent(c.ctr))
            )
          })
        )
      ),

      // Ads Section
      ...(data.ads && data.ads.length > 0 ? [
        React.createElement(
          View,
          { style: styles.section, break: true },
          React.createElement(Text, { style: styles.sectionTitle }, `ANÚNCIOS NO PERÍODO (${data.ads.length})`),
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
          ...data.ads.map((ad, i) => {
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
        React.createElement(Text, { style: styles.footerText }, `Gerado em ${formatDate(new Date())} por ${agencyName}`),
        React.createElement(Text, { style: styles.footerText }, 'Dados extraídos das plataformas de anúncios')
      )
    )
  )

  return await renderToBuffer(doc)
}
