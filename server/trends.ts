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

interface SeedTargetTeam {
  id: string
  name: string
}

interface SeedTargetCategory {
  id: string
  name: string
  teamId: string
}

interface TrendSeedConfig {
  enabled?: boolean
  days?: number
  seededAt?: string
  targetTeamIds?: string[]
  categoryId?: string | null
  categoryName?: string | null
}

export interface TrendSeedResult {
  days: number
  fromDate: string
  toDate: string
  rowsAffected: number
  categoryId: string | null
  categoryName: string | null
}

const TREND_SEED_SETTINGS_KEY = 'dashboard-trend-seed-config'

const formatDate = (date: Date) => date.toISOString().slice(0, 10)

const parseTrendSeedConfig = (value: string | undefined): TrendSeedConfig | null => {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as TrendSeedConfig
  } catch {
    return null
  }
}

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

const listDerivedTrendRows = (days: number, organizationId?: string): TrendRow[] => {
  const db = getDb()
  const daysParam = `-${Math.max(clampTrendDays(days) - 1, 0)} days`

  if (organizationId) {
    return db.prepare(`
      SELECT DATE(CreatedAt) AS date, TeamId AS teamId, COUNT(*) AS count
      FROM Tickets
      WHERE CreatedAt >= date('now', ?)
        AND TeamId IN (SELECT Id FROM Teams WHERE OrganizationId = ?)
      GROUP BY DATE(CreatedAt), TeamId
      ORDER BY DATE(CreatedAt) ASC, TeamId ASC
    `).all(daysParam, organizationId) as TrendRow[]
  }

  return db.prepare(`
    SELECT DATE(CreatedAt) AS date, TeamId AS teamId, COUNT(*) AS count
    FROM Tickets
    WHERE CreatedAt >= date('now', ?)
    GROUP BY DATE(CreatedAt), TeamId
    ORDER BY DATE(CreatedAt) ASC, TeamId ASC
  `).all(daysParam) as TrendRow[]
}

const listStoredTrendRows = (days: number, targetTeamIds: string[]): TrendRow[] => {
  const db = getDb()

  if (targetTeamIds.length === 0) {
    return []
  }

  const placeholders = targetTeamIds.map(() => '?').join(', ')

  return db.prepare(`
    SELECT TrendDate AS date, TeamId AS teamId, TicketCount AS count
    FROM TeamTicketTrends
    WHERE TrendDate >= date('now', ?)
      AND TeamId IN (${placeholders})
    ORDER BY TrendDate ASC, TeamId ASC
  `).all(`-${Math.max(clampTrendDays(days) - 1, 0)} days`, ...targetTeamIds) as TrendRow[]
}

const readTrendSeedConfig = () => {
  const db = getDb()
  const row = db.prepare('SELECT Value AS value FROM AppSettings WHERE Key = ?').get(TREND_SEED_SETTINGS_KEY) as { value?: string } | undefined

  return parseTrendSeedConfig(row?.value)
}

const hasActiveTrendSeed = (config: TrendSeedConfig | null) => {
  return config?.enabled === true
}

const listAllTeams = () => {
  const db = getDb()
  return db.prepare('SELECT Id AS id, Name AS name FROM Teams ORDER BY Name ASC').all() as SeedTargetTeam[]
}

const listTeamsByOrg = (organizationId: string) => {
  const db = getDb()
  return db.prepare('SELECT Id AS id, Name AS name FROM Teams WHERE OrganizationId = ? ORDER BY Name ASC').all(organizationId) as SeedTargetTeam[]
}

const resolveTrendSeedTargets = (categoryId?: string): { teams: SeedTargetTeam[]; category: SeedTargetCategory | null } => {
  const allTeams = listAllTeams()

  if (!categoryId) {
    return { teams: allTeams, category: null }
  }

  const db = getDb()
  const category = db.prepare(`
    SELECT c.Id AS id, c.Name AS name, c.TeamId AS teamId
    FROM Categories c
    WHERE c.Id = ?
  `).get(categoryId) as SeedTargetCategory | undefined

  if (!category) {
    throw new Error('category_not_found')
  }

  const team = allTeams.find((entry) => entry.id === category.teamId)

  if (!team) {
    throw new Error('category_team_not_found')
  }

  return {
    teams: [team],
    category,
  }
}

const writeTrendSeedConfig = (config: TrendSeedConfig) => {
  const db = getDb()
  const upsertSetting = db.prepare(`
    INSERT INTO AppSettings (Key, Value, UpdatedAt)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(Key) DO UPDATE SET Value = excluded.Value, UpdatedAt = datetime('now')
  `)

  upsertSetting.run(TREND_SEED_SETTINGS_KEY, JSON.stringify(config))
}

const clearTrendSeedConfig = () => {
  const db = getDb()
  db.prepare('DELETE FROM AppSettings WHERE Key = ?').run(TREND_SEED_SETTINGS_KEY)
}

const getActiveTargetTeamIds = (config: TrendSeedConfig | null, fallbackTeams: SeedTargetTeam[]) => {
  if (Array.isArray(config?.targetTeamIds) && config.targetTeamIds.length > 0) {
    return config.targetTeamIds
  }

  return fallbackTeams.map((team) => team.id)
}

export const listTeamTicketTrends = async (days: number = 21, organizationId?: string): Promise<TrendRecord[]> => {
  const safeDays = clampTrendDays(days)
  const derivedRows = listDerivedTrendRows(safeDays, organizationId)
  const seedConfig = readTrendSeedConfig()

  if (!hasActiveTrendSeed(seedConfig)) {
    return buildTrendRecords(derivedRows, safeDays)
  }

  const scopedTeams = organizationId ? listTeamsByOrg(organizationId) : listAllTeams()
  const scopedTeamIdSet = new Set(scopedTeams.map((t) => t.id))
  const targetTeamIds = getActiveTargetTeamIds(seedConfig, scopedTeams).filter((id) => scopedTeamIdSet.has(id))
  const storedRows = listStoredTrendRows(safeDays, targetTeamIds)
  const mergedRows = new Map<string, TrendRow>()

  for (const row of derivedRows) {
    mergedRows.set(`${row.date}:${row.teamId}`, row)
  }

  for (const row of storedRows) {
    mergedRows.set(`${row.date}:${row.teamId}`, row)
  }

  return buildTrendRecords(Array.from(mergedRows.values()), safeDays)
}

export const seedTeamTicketTrends = async (days: number = 60, categoryId?: string): Promise<TrendSeedResult> => {
  const safeDays = clampTrendDays(days)
  const db = getDb()
  const dates = getTrendDates(safeDays)
  const currentConfig = readTrendSeedConfig()
  const { teams, category } = resolveTrendSeedTargets(categoryId)
  const upsertTrend = db.prepare(`
    INSERT INTO TeamTicketTrends (TrendDate, TeamId, TicketCount)
    VALUES (?, ?, ?)
    ON CONFLICT(TrendDate, TeamId) DO UPDATE SET TicketCount = excluded.TicketCount
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

    writeTrendSeedConfig({
      enabled: true,
      days: safeDays,
      seededAt: new Date().toISOString(),
      targetTeamIds: Array.from(
        new Set([...(currentConfig?.targetTeamIds ?? []), ...teams.map((team) => team.id)]),
      ),
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
    })

    db.exec('COMMIT')

    return {
      days: safeDays,
      fromDate: dates[0],
      toDate: dates[dates.length - 1],
      rowsAffected,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
    }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export const clearSeededTeamTicketTrends = async (days: number = 60, categoryId?: string): Promise<TrendSeedResult> => {
  const safeDays = clampTrendDays(days)
  const db = getDb()
  const dates = getTrendDates(safeDays)
  const currentConfig = readTrendSeedConfig()
  const { teams, category } = resolveTrendSeedTargets(categoryId)
  const placeholders = teams.map(() => '?').join(', ')
  const deleteSeededRows = db.prepare(`
    DELETE FROM TeamTicketTrends
    WHERE TrendDate >= date('now', ?)
      AND TeamId IN (${placeholders})
  `)

  db.exec('BEGIN TRANSACTION')

  try {
    const result = deleteSeededRows.run(
      `-${Math.max(safeDays - 1, 0)} days`,
      ...teams.map((team) => team.id),
    )
    const remainingTargetTeamIds = getActiveTargetTeamIds(currentConfig, listAllTeams()).filter(
      (teamId) => !teams.some((team) => team.id === teamId),
    )

    if (remainingTargetTeamIds.length === 0) {
      clearTrendSeedConfig()
    } else {
      writeTrendSeedConfig({
        enabled: true,
        days: safeDays,
        seededAt: currentConfig?.seededAt ?? new Date().toISOString(),
        targetTeamIds: remainingTargetTeamIds,
        categoryId: currentConfig?.categoryId ?? null,
        categoryName: currentConfig?.categoryName ?? null,
      })
    }

    db.exec('COMMIT')

    return {
      days: safeDays,
      fromDate: dates[0],
      toDate: dates[dates.length - 1],
      rowsAffected: result.changes,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
    }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
