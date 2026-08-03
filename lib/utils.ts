import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value)
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

const SP_TZ = 'America/Sao_Paulo'

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: SP_TZ }).format(new Date(date))
}

// Returns Y/M/D as seen in São Paulo timezone (so "today" matches what the user sees)
export function getSPDateParts(date: Date = new Date()): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  return {
    y: parseInt(parts.find((p) => p.type === 'year')!.value),
    m: parseInt(parts.find((p) => p.type === 'month')!.value) - 1, // 0-indexed
    d: parseInt(parts.find((p) => p.type === 'day')!.value),
  }
}

// Format a Date as YYYY-MM-DD in São Paulo timezone
export function formatSPDate(date: Date = new Date()): string {
  const { y, m, d } = getSPDateParts(date)
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Fronteira de um dia do calendário SP, ANCORADA em meia-noite UTC.
// Precisa casar com o ARMAZENAMENTO: o sync grava cada dia como
// new Date("YYYY-MM-DD") = meia-noite UTC (00:00Z). Meta/Google reportam por
// dia no fuso da conta (SP), e esse rótulo de data é guardado em 00:00Z.
// Ancorar as fronteiras em meia-noite SP (03:00 UTC) desalinhava 3h e fazia
// dias de fronteira vazarem pro mês/dia errado (ex: 01/08 caindo em "julho",
// ou o próprio "hoje" sumindo). Como os buckets diários ficam espaçados de 24h
// em 00:00Z, usar 00:00 UTC bate exatamente com o gerenciador do Meta.
// getSPDateParts continua definindo QUAL dia do calendário é "hoje" em SP.
function spMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d, 0, 0, 0))
}

// Intervalo personalizado 'YYYY-MM-DD' → [meia-noite SP do início, fim do dia SP do fim].
// Valida formato, ordem e span máximo (370 dias). Retorna null se inválido.
export function getCustomDateRange(
  startStr?: string | null,
  endStr?: string | null
): { start: Date; end: Date } | null {
  const re = /^\d{4}-\d{2}-\d{2}$/
  if (!startStr || !endStr || !re.test(startStr) || !re.test(endStr)) return null
  const [ys, ms, ds] = startStr.split('-').map(Number)
  const [ye, me, de] = endStr.split('-').map(Number)
  const start = new Date(Date.UTC(ys, ms - 1, ds, 0, 0, 0)) // meia-noite UTC do dia (casa com o storage)
  const end = new Date(Date.UTC(ye, me - 1, de + 1, 0, 0, 0) - 1) // último ms do dia final
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return null
  if (end.getTime() - start.getTime() > 370 * 86_400_000) return null
  return { start, end }
}

export function getDateRange(filter: string): { start: Date; end: Date } {
  const now = new Date()
  const { y, m, d } = getSPDateParts(now)
  const todaySP = spMidnight(y, m, d)

  switch (filter) {
    case 'today':
      return { start: todaySP, end: now }
    case 'yesterday':
      return { start: spMidnight(y, m, d - 1), end: todaySP }
    case 'last7days':
      return { start: spMidnight(y, m, d - 7), end: now }
    case 'last30days':
      return { start: spMidnight(y, m, d - 30), end: now }
    case 'thisMonth':
      return { start: spMidnight(y, m, 1), end: now }
    case 'lastMonth':
      return {
        start: spMidnight(y, m - 1, 1),
        // Last millisecond before first day of current month (in SP)
        end: new Date(spMidnight(y, m, 1).getTime() - 1),
      }
    default:
      return { start: todaySP, end: now }
  }
}
