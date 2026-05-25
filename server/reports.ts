import { getDb } from './db.js'

export interface TicketReport {
  status: string
  count: number
}

export interface PriorityReport {
  priority: string
  count: number
}

export interface AssigneeReport {
  assigneeId: string | null
  assigneeName: string | null
  count: number
}

export interface TrendReport {
  date: string
  created: number
  resolved: number
}

export interface ExportTicketRow {
  Id: string
  Title: string
  Description: string
  Status: string
  Priority: string
  RequestorName: string
  RequestorEmail: string
  Location: string
  CreatedAt: string
  UpdatedAt: string
  AssigneeName: string | null
  CategoryName: string
  TeamName: string
}

export const getTicketStatusReport = (): TicketReport[] => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT Status as status, COUNT(*) as count
    FROM Tickets
    GROUP BY Status
    ORDER BY count DESC
  `).all() as TicketReport[]
  return rows
}

export const getTicketPriorityReport = (): PriorityReport[] => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT Priority as priority, COUNT(*) as count
    FROM Tickets
    GROUP BY Priority
    ORDER BY count DESC
  `).all() as PriorityReport[]
  return rows
}

export const getAssigneeReport = (): AssigneeReport[] => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT t.AssignedToId as assigneeId, u.Name as assigneeName, COUNT(*) as count
    FROM Tickets t
    LEFT JOIN Users u ON t.AssignedToId = u.Id
    GROUP BY t.AssignedToId, u.Name
    ORDER BY count DESC
  `).all() as AssigneeReport[]
  return rows
}

export const getTrendReport = (days: number = 30): TrendReport[] => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT
      DATE(CreatedAt) as date,
      COUNT(*) as created
    FROM Tickets
    WHERE CreatedAt >= date('now', '-${days} days')
    GROUP BY DATE(CreatedAt)
    ORDER BY date
  `).all() as { date: string; created: number }[]

  const resolvedRows = db.prepare(`
    SELECT
      DATE(UpdatedAt) as date,
      COUNT(*) as resolved
    FROM Tickets
    WHERE Status IN ('Resolved', 'Closed') AND UpdatedAt >= date('now', '-${days} days')
    GROUP BY DATE(UpdatedAt)
    ORDER BY date
  `).all() as { date: string; resolved: number }[]

  // Merge created and resolved
  const trendMap = new Map<string, TrendReport>()
  rows.forEach(row => {
    trendMap.set(row.date, { date: row.date, created: row.created, resolved: 0 })
  })
  resolvedRows.forEach(row => {
    const existing = trendMap.get(row.date)
    if (existing) {
      existing.resolved = row.resolved
    } else {
      trendMap.set(row.date, { date: row.date, created: 0, resolved: row.resolved })
    }
  })

  return Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date))
}

const RESOLUTION_BUCKET_ORDER = ['< 1 day', '1–3 days', '3–7 days', '1–2 weeks', '> 2 weeks']
const FIRST_RESPONSE_BUCKET_ORDER = ['< 1 hr', '1–4 hrs', '4–8 hrs', '8–24 hrs', '> 1 day']

const bucketResolutionDays = (days: number): string => {
  if (days < 1) return '< 1 day'
  if (days < 3) return '1–3 days'
  if (days < 7) return '3–7 days'
  if (days < 14) return '1–2 weeks'
  return '> 2 weeks'
}

const bucketFirstResponseHours = (hours: number): string => {
  if (hours < 1) return '< 1 hr'
  if (hours < 4) return '1–4 hrs'
  if (hours < 8) return '4–8 hrs'
  if (hours < 24) return '8–24 hrs'
  return '> 1 day'
}

export interface ResolutionTimeBucket {
  bucket: string
  count: number
}

export interface AvgResolutionByPriority {
  priority: string
  avgDays: number
  count: number
}

export interface AvgResolutionByTeam {
  teamId: string
  teamName: string
  avgDays: number
  count: number
}

export interface OpenAgeBucket {
  bucket: string
  count: number
}

export interface FirstResponseBucket {
  bucket: string
  count: number
}

export const getResolutionTimeBuckets = (): ResolutionTimeBucket[] => {
  const db = getDb()
  const rows = db.prepare(`
    WITH FirstResolution AS (
      SELECT TicketId, MIN(ActivityAt) AS ResolvedAt
      FROM TicketActivity
      WHERE Message LIKE '% to Resolved.' OR Message LIKE '% to Closed.'
      GROUP BY TicketId
    )
    SELECT (julianday(fr.ResolvedAt) - julianday(t.CreatedAt)) AS daysToResolve
    FROM Tickets t
    JOIN FirstResolution fr ON t.Id = fr.TicketId
  `).all() as { daysToResolve: number }[]

  const counts = Object.fromEntries(RESOLUTION_BUCKET_ORDER.map((b) => [b, 0]))
  for (const row of rows) {
    counts[bucketResolutionDays(row.daysToResolve)]++
  }
  return RESOLUTION_BUCKET_ORDER.map((bucket) => ({ bucket, count: counts[bucket] }))
}

export const getAvgResolutionByPriority = (): AvgResolutionByPriority[] => {
  const db = getDb()
  return db.prepare(`
    WITH FirstResolution AS (
      SELECT TicketId, MIN(ActivityAt) AS ResolvedAt
      FROM TicketActivity
      WHERE Message LIKE '% to Resolved.' OR Message LIKE '% to Closed.'
      GROUP BY TicketId
    )
    SELECT
      t.Priority AS priority,
      AVG(julianday(fr.ResolvedAt) - julianday(t.CreatedAt)) AS avgDays,
      COUNT(*) AS count
    FROM Tickets t
    JOIN FirstResolution fr ON t.Id = fr.TicketId
    GROUP BY t.Priority
    ORDER BY t.Priority ASC
  `).all() as AvgResolutionByPriority[]
}

export const getAvgResolutionByTeam = (): AvgResolutionByTeam[] => {
  const db = getDb()
  return db.prepare(`
    WITH FirstResolution AS (
      SELECT TicketId, MIN(ActivityAt) AS ResolvedAt
      FROM TicketActivity
      WHERE Message LIKE '% to Resolved.' OR Message LIKE '% to Closed.'
      GROUP BY TicketId
    )
    SELECT
      t.TeamId AS teamId,
      team.Name AS teamName,
      AVG(julianday(fr.ResolvedAt) - julianday(t.CreatedAt)) AS avgDays,
      COUNT(*) AS count
    FROM Tickets t
    JOIN FirstResolution fr ON t.Id = fr.TicketId
    JOIN Teams team ON t.TeamId = team.Id
    GROUP BY t.TeamId, team.Name
    ORDER BY team.Name ASC
  `).all() as AvgResolutionByTeam[]
}

export const getOpenTicketAgeBuckets = (): OpenAgeBucket[] => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT (julianday('now') - julianday(CreatedAt)) AS ageInDays
    FROM Tickets
    WHERE Status IN ('Open', 'In Progress', 'Pending')
  `).all() as { ageInDays: number }[]

  const counts = Object.fromEntries(RESOLUTION_BUCKET_ORDER.map((b) => [b, 0]))
  for (const row of rows) {
    counts[bucketResolutionDays(row.ageInDays)]++
  }
  return RESOLUTION_BUCKET_ORDER.map((bucket) => ({ bucket, count: counts[bucket] }))
}

export const getFirstResponseTimeBuckets = (): FirstResponseBucket[] => {
  const db = getDb()
  const rows = db.prepare(`
    WITH FirstResponse AS (
      SELECT TicketId, MIN(ActivityAt) AS FirstResponseAt
      FROM TicketActivity
      WHERE Message != 'Ticket created from TeamSupportPro.'
      GROUP BY TicketId
    )
    SELECT (julianday(fr.FirstResponseAt) - julianday(t.CreatedAt)) * 24 AS hoursToFirstResponse
    FROM Tickets t
    JOIN FirstResponse fr ON t.Id = fr.TicketId
  `).all() as { hoursToFirstResponse: number }[]

  const counts = Object.fromEntries(FIRST_RESPONSE_BUCKET_ORDER.map((b) => [b, 0]))
  for (const row of rows) {
    counts[bucketFirstResponseHours(row.hoursToFirstResponse)]++
  }
  return FIRST_RESPONSE_BUCKET_ORDER.map((bucket) => ({ bucket, count: counts[bucket] }))
}

export const getAllTicketsForExport = (): ExportTicketRow[] => {
  const db = getDb()
  return db.prepare(`
    SELECT
      t.Id, t.Title, t.Description, t.Status, t.Priority,
      t.RequestorName, t.RequestorEmail, t.Location,
      t.CreatedAt, t.UpdatedAt,
      u.Name as AssigneeName,
      c.Name as CategoryName,
      team.Name as TeamName
    FROM Tickets t
    LEFT JOIN Users u ON t.AssignedToId = u.Id
    LEFT JOIN Categories c ON t.CategoryId = c.Id
    LEFT JOIN Teams team ON t.TeamId = team.Id
    ORDER BY t.CreatedAt DESC
  `).all() as ExportTicketRow[]
}