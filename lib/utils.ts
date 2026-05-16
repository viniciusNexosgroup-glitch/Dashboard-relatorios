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

// Returns a Date representing midnight (00:00:00) in São Paulo timezone (UTC-3, no DST).
// Stored as UTC, the wall-clock value in SP will be the y/m/d we requested.
// JS Date constructor handles negative/overflow days correctly.
function spMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d, 3, 0, 0)) // UTC+3 = SP midnight
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
