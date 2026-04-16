import { getDb } from './db.js'

export interface DashboardSummaryRecord {
  stats: {
    total: number
    open: number
    inProgress: number
    pending: number
    critical: number
  }
  statusCounts: Array<{
    status: string
    count: number
  }>
  teamWorkload: Array<{
    teamId: string
    count: number
  }>
}

const statusOrder = ['Open', 'In Progress', 'Pending', 'Resolved', 'Closed']

export const getDashboardSummary = async (): Promise<DashboardSummaryRecord> => {
  const db = getDb()

  const statsRow = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN Status = 'Open' THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN Status = 'In Progress' THEN 1 ELSE 0 END) AS inProgress,
      SUM(CASE WHEN Status = 'Pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN Priority = 'Critical' THEN 1 ELSE 0 END) AS critical
    FROM Tickets
  `).get() as Record<string, unknown>

  const statusRows = db.prepare(`
    SELECT Status AS status, COUNT(*) AS count FROM Tickets GROUP BY Status
  `).all() as Array<{ status: string; count: number }>

  const workloadRows = db.prepare(`
    SELECT TeamId AS teamId, COUNT(*) AS count FROM Tickets GROUP BY TeamId
  `).all() as Array<{ teamId: string; count: number }>

  const statusMap = new Map(statusRows.map((row) => [row.status, row.count]))

  return {
    stats: {
      total: Number(statsRow.total ?? 0),
      open: Number(statsRow.open ?? 0),
      inProgress: Number(statsRow.inProgress ?? 0),
      pending: Number(statsRow.pending ?? 0),
      critical: Number(statsRow.critical ?? 0),
    },
    statusCounts: statusOrder.map((status) => ({
      status,
      count: statusMap.get(status) ?? 0,
    })),
    teamWorkload: workloadRows.map((row) => ({
      teamId: row.teamId,
      count: row.count,
    })),
  }
}
