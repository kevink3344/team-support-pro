import { getDb } from './db.js'

export interface TrendRecord {
  date: string
  values: Record<string, number>
}

interface TrendRow {
  date: string
  teamId: string
  count: number
}

export interface TrendSeedResult {
  days: number
  fromDate: string
  toDate: string
  rowsAffected: number
}

const TREND_SEED_SETTINGS_KEY = 'dashboard-trend-seed-config'

const formatDate = (date: Date) => date.toISOString().slice(0, 10)

const clampTrendDays = (days: number) => Math.min(Math.max(Math.trunc(days) || 0, 1), 365)

const getTrendDates = (days: number) => {
  const safeDays = clampTrendDays(days)
  const startDate = new Date()
  startDate.setHours(0, 0, 0, 0)
  startDate.setDate(startDate.getDate() - Math.max(safeDays - 1, 0))

  return Array.from({ length: safeDays }, (_, index) => {
    const nextDate = new Date(startDate)
    nextDate.setDate(startDate.getDate() + index)
    return formatDate(nextDate)
  })
}

const buildTrendRecords = (rows: TrendRow[], days: number) => {
  const trendMap = new Map<string, Record<string, number>>()

  getTrendDates(days).forEach((date) => {
    trendMap.set(date, {})
  })

  for (const row of rows) {
    const existing = trendMap.get(row.date)

    if (!existing) {
      continue
    }

    existing[row.teamId] = row.count
  }

  return Array.from(trendMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, values]) => ({ date, values }))
}

const listDerivedTrendRows = (days: number): TrendRow[] => {
  const db = getDb()

  return db.prepare(`
    SELECT DATE(CreatedAt) AS date, TeamId AS teamId, COUNT(*) AS count
    FROM Tickets
    WHERE CreatedAt >= date('now', ?)
    GROUP BY DATE(CreatedAt), TeamId
    ORDER BY DATE(CreatedAt) ASC, TeamId ASC
  `).all(`-${Math.max(clampTrendDays(days) - 1, 0)} days`) as TrendRow[]
}

const listStoredTrendRows = (days: number): TrendRow[] => {
  const db = getDb()

  return db.prepare(`
    SELECT TrendDate AS date, TeamId AS teamId, TicketCount AS count
    FROM TeamTicketTrends
    WHERE TrendDate >= date('now', ?)
    ORDER BY TrendDate ASC, TeamId ASC
  `).all(`-${Math.max(clampTrendDays(days) - 1, 0)} days`) as TrendRow[]
}

const hasActiveTrendSeed = () => {
  const db = getDb()
  const row = db.prepare('SELECT Value AS value FROM AppSettings WHERE Key = ?').get(TREND_SEED_SETTINGS_KEY) as { value?: string } | undefined

  if (!row?.value) {
    return false
  }

  try {
    const parsed = JSON.parse(row.value) as { enabled?: boolean }
    return parsed.enabled === true
  } catch {
    return false
  }
}

export const listTeamTicketTrends = async (days: number = 21): Promise<TrendRecord[]> => {
  const safeDays = clampTrendDays(days)
  const derivedRows = listDerivedTrendRows(safeDays)

  if (!hasActiveTrendSeed()) {
    return buildTrendRecords(derivedRows, safeDays)
  }

  const storedRows = listStoredTrendRows(safeDays)
  const mergedRows = new Map<string, TrendRow>()

  for (const row of derivedRows) {
    mergedRows.set(`${row.date}:${row.teamId}`, row)
  }

  for (const row of storedRows) {
    mergedRows.set(`${row.date}:${row.teamId}`, row)
  }

  return buildTrendRecords(Array.from(mergedRows.values()), safeDays)
}

export const seedTeamTicketTrends = async (days: number = 60): Promise<TrendSeedResult> => {
  const safeDays = clampTrendDays(days)
  const db = getDb()
  const dates = getTrendDates(safeDays)
  const teams = db.prepare('SELECT Id AS id FROM Teams ORDER BY Name ASC').all() as Array<{ id: string }>
  const upsertTrend = db.prepare(`
    INSERT INTO TeamTicketTrends (TrendDate, TeamId, TicketCount)
    VALUES (?, ?, ?)
    ON CONFLICT(TrendDate, TeamId) DO UPDATE SET TicketCount = excluded.TicketCount
  `)
  const upsertSetting = db.prepare(`
    INSERT INTO AppSettings (Key, Value, UpdatedAt)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(Key) DO UPDATE SET Value = excluded.Value, UpdatedAt = datetime('now')
  `)

  db.exec('BEGIN TRANSACTION')

  try {
    let rowsAffected = 0

    dates.forEach((date, dayIndex) => {
      const dateValue = new Date(`${date}T00:00:00.000Z`)
      const weekendPenalty = dateValue.getUTCDay() === 0 || dateValue.getUTCDay() === 6 ? 1 : 0

      teams.forEach((team, teamIndex) => {
        const baseline = Math.max(1, teams.length - teamIndex + 1)
        const wave = (dayIndex * 3 + teamIndex * 5) % 4
        const ticketCount = Math.max(0, baseline + wave - weekendPenalty)
        upsertTrend.run(date, team.id, ticketCount)
        rowsAffected += 1
      })
    })

    upsertSetting.run(
      TREND_SEED_SETTINGS_KEY,
      JSON.stringify({ enabled: true, days: safeDays, seededAt: new Date().toISOString() }),
    )

    db.exec('COMMIT')

    return {
      days: safeDays,
      fromDate: dates[0],
      toDate: dates[dates.length - 1],
      rowsAffected,
    }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export const clearSeededTeamTicketTrends = async (days: number = 60): Promise<TrendSeedResult> => {
  const safeDays = clampTrendDays(days)
  const db = getDb()
  const dates = getTrendDates(safeDays)
  const deleteSeededRows = db.prepare("DELETE FROM TeamTicketTrends WHERE TrendDate >= date('now', ?)")
  const deleteSeedSetting = db.prepare('DELETE FROM AppSettings WHERE Key = ?')

  db.exec('BEGIN TRANSACTION')

  try {
    const result = deleteSeededRows.run(`-${Math.max(safeDays - 1, 0)} days`)
    deleteSeedSetting.run(TREND_SEED_SETTINGS_KEY)
    db.exec('COMMIT')

    return {
      days: safeDays,
      fromDate: dates[0],
      toDate: dates[dates.length - 1],
      rowsAffected: result.changes,
    }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
