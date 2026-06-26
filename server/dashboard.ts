import { getDb, dbGet, dbAll } from './db.js'

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

export const getDashboardSummary = async (teamId: string): Promise<DashboardSummaryRecord> => {
  const db = getDb()

  const statsRow = await dbGet(db, `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN Status = 'Open' THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN Status = 'In Progress' THEN 1 ELSE 0 END) AS inProgress,
      SUM(CASE WHEN Status = 'Pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN Priority = 'Critical' THEN 1 ELSE 0 END) AS critical
    FROM Tickets
    WHERE TeamId = ?
  `, [teamId])

  const statusRows = await dbAll(db, `SELECT Status AS status, COUNT(*) AS count FROM Tickets GROUP BY Status`) as Array<{ status: unknown; count: unknown }>
  const workloadRows = await dbAll(db, `SELECT TeamId AS teamId, COUNT(*) AS count FROM Tickets GROUP BY TeamId`) as Array<{ teamId: unknown; count: unknown }>

  const statusMap = new Map(statusRows.map((row) => [String(row.status), Number(row.count)]))

  return {
    stats: {
      total: Number(statsRow?.total ?? 0),
      open: Number(statsRow?.open ?? 0),
      inProgress: Number(statsRow?.inProgress ?? 0),
      pending: Number(statsRow?.pending ?? 0),
      critical: Number(statsRow?.critical ?? 0),
    },
    statusCounts: statusOrder.map((status) => ({
      status,
      count: statusMap.get(status) ?? 0,
    })),
    teamWorkload: workloadRows.map((row) => ({
      teamId: String(row.teamId),
      count: Number(row.count),
    })),
  }
}
