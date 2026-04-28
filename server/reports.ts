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