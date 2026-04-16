import crypto from 'node:crypto'

import { getDb } from './db.js'

const ticketStatusValues = new Set(['Open', 'In Progress', 'Pending', 'Resolved', 'Closed'])
const ticketPriorityValues = new Set(['Low', 'Medium', 'High', 'Critical'])

export interface TicketRecord {
  id: string
  title: string
  description: string
  status: string
  priority: string
  teamId: string
  categoryId: string
  attachmentCount: number
  assignedToId: string | null
  requestorName: string
  requestorEmail: string
  location: string
  dueLabel: string
  createdAt: string
  updatedAt: string
  activity: TicketActivityRecord[]
}

export interface CreateTicketInput {
  id?: string
  title: string
  description: string
  priority: string
  teamId: string
  categoryId: string
  assignedToId: string | null
  requestorName: string
  requestorEmail: string
  location: string
}

export interface TicketActivityRecord {
  id: string
  ticketId: string
  actor: string
  message: string
  at: string
}

export interface UpdateTicketInput {
  title: string
  description: string
  status: string
  priority: string
  categoryId: string
  assignedToId: string | null
}

const mapActivityRecord = (record: Record<string, unknown>): TicketActivityRecord => ({
  id: String(record.id),
  ticketId: String(record.ticketId),
  actor: String(record.actor),
  message: String(record.message),
  at: new Date(String(record.activityAt)).toISOString(),
})

const mapTicketRecord = (record: Record<string, unknown>): Omit<TicketRecord, 'activity'> => ({
  id: String(record.id),
  title: String(record.title),
  description: String(record.description),
  status: String(record.status),
  priority: String(record.priority),
  teamId: String(record.teamId),
  categoryId: String(record.categoryId),
  attachmentCount: Number(record.attachmentCount) || 0,
  assignedToId: typeof record.assignedToId === 'string' ? record.assignedToId : null,
  requestorName: String(record.requestorName),
  requestorEmail: String(record.requestorEmail),
  location: String(record.location),
  dueLabel: String(record.dueLabel),
  createdAt: new Date(String(record.createdAt)).toISOString(),
  updatedAt: new Date(String(record.updatedAt)).toISOString(),
})

const groupTicketsWithActivity = (
  tickets: Array<Omit<TicketRecord, 'activity'>>,
  activity: TicketActivityRecord[],
): TicketRecord[] => {
  const activityByTicket = new Map<string, TicketActivityRecord[]>()
  activity.forEach((entry) => {
    const current = activityByTicket.get(entry.ticketId) ?? []
    current.push(entry)
    activityByTicket.set(entry.ticketId, current)
  })
  return tickets.map((ticket) => ({
    ...ticket,
    activity: (activityByTicket.get(ticket.id) ?? []).sort(
      (left, right) => new Date(left.at).getTime() - new Date(right.at).getTime(),
    ),
  }))
}

const generateTicketId = () => `TKT-${Math.floor(10000 + Math.random() * 89999)}`
const isNonEmpty = (value: string) => value.trim().length > 0

const validateCreateTicketInput = (input: CreateTicketInput) => {
  if (!isNonEmpty(input.title) || !isNonEmpty(input.description) || !isNonEmpty(input.teamId) || !isNonEmpty(input.categoryId) || !isNonEmpty(input.requestorName) || !isNonEmpty(input.requestorEmail)) return false
  return ticketPriorityValues.has(input.priority)
}

const validateUpdateTicketInput = (input: UpdateTicketInput) => {
  if (!input.title.trim() || !input.description.trim() || !input.categoryId.trim()) return false
  return ticketStatusValues.has(input.status) && ticketPriorityValues.has(input.priority)
}

export const ticketBelongsToTeam = async (ticketId: string, teamId: string) => {
  const db = getDb()
  const row = db.prepare('SELECT 1 AS allowed FROM Tickets WHERE Id = ? AND TeamId = ?').get(ticketId, teamId)
  return !!row
}

export const listTicketActivity = async (): Promise<TicketActivityRecord[]> => {
  const db = getDb()
  const rows = db.prepare('SELECT Id AS id, TicketId AS ticketId, Actor AS actor, Message AS message, ActivityAt AS activityAt FROM TicketActivity').all() as Record<string, unknown>[]
  return rows.map(mapActivityRecord)
}

export const listTickets = async (teamId?: string): Promise<TicketRecord[]> => {
  const db = getDb()
  const ticketRows = teamId
    ? db.prepare(`SELECT Id AS id, Title AS title, Description AS description, Status AS status, Priority AS priority, TeamId AS teamId, CategoryId AS categoryId, AssignedToId AS assignedToId, RequestorName AS requestorName, RequestorEmail AS requestorEmail, Location AS location, DueLabel AS dueLabel, CreatedAt AS createdAt, UpdatedAt AS updatedAt, (SELECT COUNT(1) FROM TicketAttachments ta WHERE ta.TicketId = Tickets.Id AND ta.IsDeleted = 0) AS attachmentCount FROM Tickets WHERE TeamId = ? ORDER BY UpdatedAt DESC, CreatedAt DESC`).all(teamId) as Record<string, unknown>[]
    : db.prepare(`SELECT Id AS id, Title AS title, Description AS description, Status AS status, Priority AS priority, TeamId AS teamId, CategoryId AS categoryId, AssignedToId AS assignedToId, RequestorName AS requestorName, RequestorEmail AS requestorEmail, Location AS location, DueLabel AS dueLabel, CreatedAt AS createdAt, UpdatedAt AS updatedAt, (SELECT COUNT(1) FROM TicketAttachments ta WHERE ta.TicketId = Tickets.Id AND ta.IsDeleted = 0) AS attachmentCount FROM Tickets ORDER BY UpdatedAt DESC, CreatedAt DESC`).all() as Record<string, unknown>[]

  const tickets = ticketRows.map(mapTicketRecord)
  const allActivity = await listTicketActivity()
  const ticketIds = new Set(tickets.map((t) => t.id))
  return groupTicketsWithActivity(tickets, allActivity.filter((a) => ticketIds.has(a.ticketId)))
}

export const getTicketById = async (ticketId: string): Promise<TicketRecord | null> => {
  const db = getDb()
  const row = db.prepare(`SELECT Id AS id, Title AS title, Description AS description, Status AS status, Priority AS priority, TeamId AS teamId, CategoryId AS categoryId, AssignedToId AS assignedToId, RequestorName AS requestorName, RequestorEmail AS requestorEmail, Location AS location, DueLabel AS dueLabel, CreatedAt AS createdAt, UpdatedAt AS updatedAt, (SELECT COUNT(1) FROM TicketAttachments ta WHERE ta.TicketId = Tickets.Id AND ta.IsDeleted = 0) AS attachmentCount FROM Tickets WHERE Id = ?`).get(ticketId) as Record<string, unknown> | undefined
  if (!row) return null
  const ticket = mapTicketRecord(row)
  const activityRows = db.prepare('SELECT Id AS id, TicketId AS ticketId, Actor AS actor, Message AS message, ActivityAt AS activityAt FROM TicketActivity WHERE TicketId = ? ORDER BY ActivityAt ASC').all(ticketId) as Record<string, unknown>[]
  return { ...ticket, activity: activityRows.map(mapActivityRecord) }
}

export const createTicketComment = async (input: { ticketId: string; actor: string; message: string }): Promise<TicketActivityRecord> => {
  const db = getDb()
  const activityAt = new Date().toISOString()
  const id = `comment-${crypto.randomUUID()}`
  db.prepare('INSERT INTO TicketActivity (Id, TicketId, Actor, Message, ActivityAt) VALUES (?, ?, ?, ?, ?)').run(id, input.ticketId, input.actor, input.message, activityAt)
  db.prepare('UPDATE Tickets SET UpdatedAt = ? WHERE Id = ?').run(activityAt, input.ticketId)
  return { id, ticketId: input.ticketId, actor: input.actor, message: input.message, at: activityAt }
}

export const updateTicket = async (ticketId: string, input: UpdateTicketInput, actor: string): Promise<TicketRecord | null> => {
  if (!validateUpdateTicketInput(input)) return null
  const existing = await getTicketById(ticketId)
  if (!existing) return null
  const db = getDb()
  const activityAt = new Date().toISOString()
  const changeMessages: string[] = []

  if (existing.status !== input.status) changeMessages.push(`Changed status from ${existing.status} to ${input.status}.`)
  if (existing.priority !== input.priority) changeMessages.push(`Changed priority from ${existing.priority} to ${input.priority}.`)
  if (existing.assignedToId !== input.assignedToId) {
    const getName = (id: string | null) => {
      if (!id) return 'Unassigned'
      const r = db.prepare('SELECT Name FROM Users WHERE Id = ?').get(id) as Record<string, unknown> | undefined
      return typeof r?.Name === 'string' && (r.Name as string).trim() ? (r.Name as string).trim() : 'Unknown'
    }
    changeMessages.push(`Reassigned ticket from ${getName(existing.assignedToId)} to ${getName(input.assignedToId)}.`)
  }
  if (existing.categoryId !== input.categoryId) {
    const getCat = (id: string) => {
      const r = db.prepare('SELECT Name FROM Categories WHERE Id = ?').get(id) as Record<string, unknown> | undefined
      return typeof r?.Name === 'string' && (r.Name as string).trim() ? (r.Name as string).trim() : 'Unknown'
    }
    changeMessages.push(`Updated category from ${getCat(existing.categoryId)} to ${getCat(input.categoryId)}.`)
  }
  if (existing.title !== input.title) changeMessages.push('Updated ticket title.')
  if (existing.description !== input.description) changeMessages.push('Updated ticket description.')

  const tx = db.transaction(() => {
    db.prepare('UPDATE Tickets SET Title = ?, Description = ?, Status = ?, Priority = ?, CategoryId = ?, AssignedToId = ?, UpdatedAt = ? WHERE Id = ?').run(input.title.trim(), input.description.trim(), input.status, input.priority, input.categoryId, input.assignedToId, activityAt, ticketId)
    const ins = db.prepare('INSERT INTO TicketActivity (Id, TicketId, Actor, Message, ActivityAt) VALUES (?, ?, ?, ?, ?)')
    for (const msg of changeMessages) ins.run(`activity-${crypto.randomUUID()}`, ticketId, actor, msg, activityAt)
  })
  tx()
  return getTicketById(ticketId)
}

export const createTicket = async (input: CreateTicketInput, actor: string): Promise<TicketRecord | null> => {
  if (!validateCreateTicketInput(input)) return null
  const db = getDb()
  const catRow = db.prepare('SELECT TeamId FROM Categories WHERE Id = ?').get(input.categoryId) as Record<string, unknown> | undefined
  if (!catRow?.TeamId || catRow.TeamId !== input.teamId) return null
  if (input.assignedToId) {
    const userRow = db.prepare('SELECT TeamId FROM Users WHERE Id = ?').get(input.assignedToId) as Record<string, unknown> | undefined
    if (!userRow?.TeamId || userRow.TeamId !== input.teamId) return null
  }
  let ticketId = input.id?.trim() || generateTicketId()
  while (await getTicketById(ticketId)) ticketId = generateTicketId()
  const createdAt = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO Tickets (Id, Title, Description, Status, Priority, TeamId, CategoryId, AssignedToId, RequestorName, RequestorEmail, Location, DueLabel, CreatedAt, UpdatedAt) VALUES (?, ?, ?, 'Open', ?, ?, ?, ?, ?, ?, ?, 'New in queue', ?, ?)`).run(ticketId, input.title.trim(), input.description.trim(), input.priority, input.teamId, input.categoryId, input.assignedToId, input.requestorName.trim(), input.requestorEmail.trim().toLowerCase(), input.location.trim() || 'Not specified', createdAt, createdAt)
    db.prepare('INSERT INTO TicketActivity (Id, TicketId, Actor, Message, ActivityAt) VALUES (?, ?, ?, ?, ?)').run(`activity-${crypto.randomUUID()}`, ticketId, actor, 'Ticket created from TeamSupportPro.', createdAt)
  })
  tx()
  return getTicketById(ticketId)
}

export const deleteTicket = async (ticketId: string): Promise<boolean> => {
  if (!isNonEmpty(ticketId)) return false
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM TicketAttachments WHERE TicketId = ?').run(ticketId)
    db.prepare('DELETE FROM TicketActivity WHERE TicketId = ?').run(ticketId)
    db.prepare('DELETE FROM Tickets WHERE Id = ?').run(ticketId)
  })
  tx()
  return true
}
