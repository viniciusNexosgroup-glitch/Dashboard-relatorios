import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { formatCurrency } from './utils'
import type { MomentRow } from './client-moment'

// PDF da tabela "Momento do Cliente" (uma linha por loja) — enviado no grupo da equipe.

const QUALITY_COLOR: Record<string, string> = {
  'Ótimo': '#15803d',
  'Bom': '#2563eb',
  'Regular': '#b45309',
  'Ruim': '#dc2626',
}

const COLS = [
  { label: 'Loja', flex: 3.2, align: 'left' as const },
  { label: 'Criativos WhatsApp', flex: 1.2, align: 'center' as const },
  { label: 'Criativos Instagram', flex: 1.2, align: 'center' as const },
  { label: 'Custo por lead\n(mensagens)', flex: 1.5, align: 'center' as const },
  { label: 'Qualidade', flex: 1.1, align: 'center' as const },
]

const styles = StyleSheet.create({
  page: { padding: 32, paddingBottom: 48, fontFamily: 'Helvetica', backgroundColor: '#ffffff' },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#312e81' },
  subtitle: { fontSize: 9, color: '#64748b', marginTop: 4, marginBottom: 10 },
  legend: { fontSize: 7.5, color: '#64748b', marginBottom: 2 },
  table: { marginTop: 10 },
  headerRow: { flexDirection: 'row', backgroundColor: '#4f46e5', paddingVertical: 6, paddingHorizontal: 6, borderRadius: 3 },
  th: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  row: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  rowAlt: { backgroundColor: '#f8fafc' },
  td: { fontSize: 8, color: '#334155' },
  footer: { position: 'absolute', bottom: 22, left: 32, right: 32, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: '#94a3b8' },
})

const dayLabel = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/')
const creatives = (active: number | null, ran: number) => `${active ?? '—'} (${ran})`

export async function generateClientMomentPDF(
  rows: MomentRow[],
  opts: { start: Date; end: Date; periodLabel: string }
): Promise<Buffer> {
  const h = React.createElement
  const period = `${dayLabel(opts.start)} a ${dayLabel(opts.end)}`

  const cell = (text: string, i: number, extra: { fontFamily?: string; color?: string } = {}) =>
    h(Text, { key: i, style: { ...styles.td, flex: COLS[i].flex, textAlign: COLS[i].align, ...extra } }, text)

  const doc = h(
    Document,
    { title: `Momento do Cliente — ${period}` },
    h(
      Page,
      { size: 'A4', style: styles.page },
      h(Text, { style: styles.title }, 'Momento do Cliente'),
      h(Text, { style: styles.subtitle }, `Análise do Gerenciador (Meta Ads) · ${opts.periodLabel} (${period}) · ${rows.length} lojas`),
      h(Text, { style: styles.legend }, 'Criativos: ativos agora. Entre parênteses, quantos tiveram veiculação no período (inclui os já pausados).'),
      h(Text, { style: styles.legend }, 'Custo por lead: só as campanhas de mensagens (WhatsApp), investimento ÷ conversas. Visibilidade no perfil do Instagram não entra.'),
      h(Text, { style: styles.legend }, 'Qualidade dos criativos: avaliação do gestor de tráfego.'),
      h(
        View,
        { style: styles.table },
        h(
          View,
          { style: styles.headerRow, fixed: true },
          ...COLS.map((c, i) => h(Text, { key: i, style: [styles.th, { flex: c.flex, textAlign: c.align }] }, c.label))
        ),
        ...rows.map((r, idx) =>
          h(
            View,
            { key: r.clientId, style: idx % 2 ? [styles.row, styles.rowAlt] : styles.row, wrap: false },
            cell(r.company, 0),
            cell(creatives(r.activeWhatsapp, r.ranWhatsapp), 1),
            cell(creatives(r.activeInstagram, r.ranInstagram), 2),
            cell(r.cpl != null ? formatCurrency(r.cpl) : '—', 3),
            cell(r.quality || '—', 4, { fontFamily: 'Helvetica-Bold', color: QUALITY_COLOR[r.quality || ''] || '#94a3b8' })
          )
        )
      ),
      h(
        View,
        { style: styles.footer, fixed: true },
        h(Text, { style: styles.footerText }, `Momento do Cliente · ${period}`),
        h(Text, { style: styles.footerText, render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Página ${pageNumber} de ${totalPages}` })
      )
    )
  )

  return renderToBuffer(doc)
}
