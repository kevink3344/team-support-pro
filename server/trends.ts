import { getDb } from './db.js'

export interface TrendRecord {
  date: string
  values: Record<string, number>
}

export const listTeamTicketTrends = async (): Promise<TrendRecord[]> => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT TrendDate AS date, TeamId AS teamId, TicketCount AS count
    FROM TeamTicketTrends
    ORDER BY TrendDate ASC, TeamId ASC
  `).all() as Array<{ date: string; teamId: string; count: number }>

  const trendMap = new Map<string, Record<string, number>>()
  for (const row of rows) {
    const existing = trendMap.get(row.date) ?? {}
    existing[row.teamId] = row.count
    trendMap.set(row.date, existing)
  }

  return Array.from(trendMap.entries()).map(([date, values]) => ({ date, values }))
}
