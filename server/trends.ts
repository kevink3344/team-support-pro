import { getDb } from './db.js'

export interface TrendRecord {
  date: string
  values: Record<string, number>
}

const formatDate = (date: Date) => date.toISOString().slice(0, 10)

export const listTeamTicketTrends = async (days: number = 21): Promise<TrendRecord[]> => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT DATE(CreatedAt) AS date, TeamId AS teamId, COUNT(*) AS count
    FROM Tickets
    WHERE CreatedAt >= date('now', ?)
    GROUP BY DATE(CreatedAt), TeamId
    ORDER BY DATE(CreatedAt) ASC, TeamId ASC
  `).all(`-${Math.max(days - 1, 0)} days`) as Array<{ date: string; teamId: string; count: number }>

  // Build a fixed date axis so the chart always spans the requested range.
  const startDate = new Date()
  startDate.setHours(0, 0, 0, 0)
  startDate.setDate(startDate.getDate() - Math.max(days - 1, 0))

  const trendMap = new Map<string, Record<string, number>>()
  for (let i = 0; i < days; i += 1) {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + i)
    trendMap.set(formatDate(d), {})
  }

  for (const row of rows) {
    const existing = trendMap.get(row.date) ?? {}
    existing[row.teamId] = row.count
    trendMap.set(row.date, existing)
  }

  return Array.from(trendMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, values]) => ({ date, values }))
}
