import crypto from 'node:crypto'

import { getDb } from './db.js'

const ticketStatusValues = new Set(['Open', 'In Progress', 'Pending', 'Resolved', 'Closed'])
const ticketPriorityValues = new Set(['Low', 'Medium', 'High', 'Critical'])

export interface TicketCustomFieldValue {
  id: string
  ticketId: string
  fieldId: string
  fieldLabel: string
  fieldType: string
  value: string
}

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
  resolvedAt: string | null
  activity: TicketActivityRecord[]
  customFields: TicketCustomFieldValue[]
}

export interface CreateTicketCustomFieldInput {
  fieldId: string
  value: string
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
  customFields?: CreateTicketCustomFieldInput[]
}

export interface TicketActivityRecord {
  id: string
  ticketId: string
  actor: string
  message: string
  at: string
}

export interface UpdateTicketInput {
  teamId: string
  title: string
  description: string
  status: string
  priority: string
  categoryId: string
  assignedToId: string | null
  requestorName: string
  requestorEmail: string
  location: string
}

const mapActivityRecord = (record: Record<string, unknown>): TicketActivityRecord => ({
  id: String(record.id),
  ticketId: String(record.ticketId),
  actor: String(record.actor),
  message: String(record.message),
  at: new Date(String(record.activityAt)).toISOString(),
})

const mapTicketRecord = (record: Record<string, unknown>): Omit<TicketRecord, 'activity' | 'customFields'> => ({
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
  resolvedAt: typeof record.resolvedAt === 'string' ? new Date(record.resolvedAt).toISOString() : null,
})

const groupTicketsWithActivity = (
  tickets: Array<Omit<TicketRecord, 'activity' | 'customFields'>>,
  activity: TicketActivityRecord[],
  customFieldsByTicket: Map<string, TicketCustomFieldValue[]>,
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
    customFields: customFieldsByTicket.get(ticket.id) ?? [],
  }))
}

const generateTicketId = () => `TKT-${Math.floor(10000 + Math.random() * 89999)}`
const isNonEmpty = (value: string) => value.trim().length > 0

const validateCreateTicketInput = (input: CreateTicketInput) => {
  if (!isNonEmpty(input.title) || !isNonEmpty(input.description) || !isNonEmpty(input.teamId) || !isNonEmpty(input.categoryId) || !isNonEmpty(input.requestorName) || !isNonEmpty(input.requestorEmail)) return false
  return ticketPriorityValues.has(input.priority)
}

const validateUpdateTicketInput = (input: UpdateTicketInput) => {
  if (!input.title.trim() || !input.description.trim() || !input.categoryId.trim() || !input.requestorName.trim() || !input.requestorEmail.trim()) return false
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
    ? db.prepare(`SELECT Id AS id, Title AS title, Description AS description, Status AS status, Priority AS priority, TeamId AS teamId, CategoryId AS categoryId, AssignedToId AS assignedToId, RequestorName AS requestorName, RequestorEmail AS requestorEmail, Location AS location, DueLabel AS dueLabel, CreatedAt AS createdAt, UpdatedAt AS updatedAt, ResolvedAt AS resolvedAt, (SELECT COUNT(1) FROM TicketAttachments ta WHERE ta.TicketId = Tickets.Id AND ta.IsDeleted = 0) AS attachmentCount FROM Tickets WHERE TeamId = ? ORDER BY UpdatedAt DESC, CreatedAt DESC`).all(teamId) as Record<string, unknown>[]
    : db.prepare(`SELECT Id AS id, Title AS title, Description AS description, Status AS status, Priority AS priority, TeamId AS teamId, CategoryId AS categoryId, AssignedToId AS assignedToId, RequestorName AS requestorName, RequestorEmail AS requestorEmail, Location AS location, DueLabel AS dueLabel, CreatedAt AS createdAt, UpdatedAt AS updatedAt, ResolvedAt AS resolvedAt, (SELECT COUNT(1) FROM TicketAttachments ta WHERE ta.TicketId = Tickets.Id AND ta.IsDeleted = 0) AS attachmentCount FROM Tickets ORDER BY UpdatedAt DESC, CreatedAt DESC`).all() as Record<string, unknown>[]

  const tickets = ticketRows.map(mapTicketRecord)
  const allActivity = await listTicketActivity()
  const ticketIds = new Set(tickets.map((t) => t.id))

  type CFRow = { id: string; ticketId: string; fieldId: string; fieldLabel: string; fieldType: string; value: string }
  const cfRows = db
    .prepare('SELECT Id AS id, TicketId AS ticketId, FieldId AS fieldId, FieldLabel AS fieldLabel, FieldType AS fieldType, Value AS value FROM TicketCustomFieldValues WHERE TicketId IN (SELECT Id FROM Tickets' + (teamId ? ' WHERE TeamId = ?' : '') + ') ORDER BY rowid ASC')
    .all(...(teamId ? [teamId] : [])) as CFRow[]
  const customFieldsByTicket = new Map<string, TicketCustomFieldValue[]>()
  for (const row of cfRows) {
    const current = customFieldsByTicket.get(row.ticketId) ?? []
    current.push(row)
    customFieldsByTicket.set(row.ticketId, current)
  }

  return groupTicketsWithActivity(tickets, allActivity.filter((a) => ticketIds.has(a.ticketId)), customFieldsByTicket)
}

const getCustomFieldValues = (db: import('better-sqlite3').Database, ticketId: string): TicketCustomFieldValue[] => {
  type CFRow = { id: string; ticketId: string; fieldId: string; fieldLabel: string; fieldType: string; value: string }
  const rows = db
    .prepare('SELECT Id AS id, TicketId AS ticketId, FieldId AS fieldId, FieldLabel AS fieldLabel, FieldType AS fieldType, Value AS value FROM TicketCustomFieldValues WHERE TicketId = ? ORDER BY rowid ASC')
    .all(ticketId) as CFRow[]
  return rows
}

export const getTicketById = async (ticketId: string): Promise<TicketRecord | null> => {
  const db = getDb()
  const row = db.prepare(`SELECT Id AS id, Title AS title, Description AS description, Status AS status, Priority AS priority, TeamId AS teamId, CategoryId AS categoryId, AssignedToId AS assignedToId, RequestorName AS requestorName, RequestorEmail AS requestorEmail, Location AS location, DueLabel AS dueLabel, CreatedAt AS createdAt, UpdatedAt AS updatedAt, ResolvedAt AS resolvedAt, (SELECT COUNT(1) FROM TicketAttachments ta WHERE ta.TicketId = Tickets.Id AND ta.IsDeleted = 0) AS attachmentCount FROM Tickets WHERE Id = ?`).get(ticketId) as Record<string, unknown> | undefined
  if (!row) return null
  const ticket = mapTicketRecord(row)
  const activityRows = db.prepare('SELECT Id AS id, TicketId AS ticketId, Actor AS actor, Message AS message, ActivityAt AS activityAt FROM TicketActivity WHERE TicketId = ? ORDER BY ActivityAt ASC').all(ticketId) as Record<string, unknown>[]
  return { ...ticket, activity: activityRows.map(mapActivityRecord), customFields: getCustomFieldValues(db, ticketId) }
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
  if (existing.teamId !== input.teamId) {
    const getTeamName = (id: string) => {
      const r = db.prepare('SELECT Name FROM Teams WHERE Id = ?').get(id) as Record<string, unknown> | undefined
      return typeof r?.Name === 'string' && (r.Name as string).trim() ? (r.Name as string).trim() : 'Unknown'
    }
    changeMessages.push(`Transferred ticket from ${getTeamName(existing.teamId)} to ${getTeamName(input.teamId)}.`)
  }
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
  if (existing.location !== input.location) changeMessages.push('Updated ticket location.')
  if (existing.requestorName !== input.requestorName) changeMessages.push('Updated requester name.')
  if (existing.requestorEmail !== input.requestorEmail.trim().toLowerCase()) changeMessages.push('Updated requester email.')

  const resolvedStatuses = new Set(['Resolved', 'Closed'])
  const newResolvedAt = resolvedStatuses.has(input.status)
    ? (existing.resolvedAt ?? activityAt)
    : null

  const tx = db.transaction(() => {
    db.prepare('UPDATE Tickets SET Title = ?, Description = ?, Status = ?, Priority = ?, TeamId = ?, CategoryId = ?, AssignedToId = ?, RequestorName = ?, RequestorEmail = ?, Location = ?, UpdatedAt = ?, ResolvedAt = ? WHERE Id = ?').run(input.title.trim(), input.description.trim(), input.status, input.priority, input.teamId, input.categoryId, input.assignedToId, input.requestorName.trim(), input.requestorEmail.trim().toLowerCase(), input.location.trim() || 'Not specified', activityAt, newResolvedAt, ticketId)
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

  // Validate and enrich custom fields using field definitions
  type FieldDefRow = { id: string; fieldType: string; label: string; isRequired: number }
  const fieldDefs = db
    .prepare('SELECT Id AS id, FieldType AS fieldType, Label AS label, IsRequired AS isRequired FROM TicketFieldDefinitions WHERE TeamId = ?')
    .all(input.teamId) as FieldDefRow[]
  const fieldDefMap = new Map(fieldDefs.map((f) => [f.id, f]))

  const customFieldInserts: Array<{ id: string; ticketId: string; fieldId: string; fieldLabel: string; fieldType: string; value: string }> = []
  if (Array.isArray(input.customFields)) {
    for (const cf of input.customFields) {
      const def = fieldDefMap.get(cf.fieldId)
      if (!def) continue
      customFieldInserts.push({
        id: `tcfv-${crypto.randomUUID()}`,
        ticketId,
        fieldId: def.id,
        fieldLabel: def.label,
        fieldType: def.fieldType,
        value: String(cf.value ?? ''),
      })
    }
  }

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO Tickets (Id, Title, Description, Status, Priority, TeamId, CategoryId, AssignedToId, RequestorName, RequestorEmail, Location, DueLabel, CreatedAt, UpdatedAt) VALUES (?, ?, ?, 'Open', ?, ?, ?, ?, ?, ?, ?, 'New in queue', ?, ?)`).run(ticketId, input.title.trim(), input.description.trim(), input.priority, input.teamId, input.categoryId, input.assignedToId, input.requestorName.trim(), input.requestorEmail.trim().toLowerCase(), input.location.trim() || 'Not specified', createdAt, createdAt)
    db.prepare('INSERT INTO TicketActivity (Id, TicketId, Actor, Message, ActivityAt) VALUES (?, ?, ?, ?, ?)').run(`activity-${crypto.randomUUID()}`, ticketId, actor, 'Ticket created from TeamSupportPro.', createdAt)
    const insCF = db.prepare('INSERT INTO TicketCustomFieldValues (Id, TicketId, FieldId, FieldLabel, FieldType, Value) VALUES (?, ?, ?, ?, ?, ?)')
    for (const cf of customFieldInserts) insCF.run(cf.id, cf.ticketId, cf.fieldId, cf.fieldLabel, cf.fieldType, cf.value)
  })
  tx()
  return getTicketById(ticketId)
}

export const deleteTicket = async (ticketId: string): Promise<boolean> => {
  if (!isNonEmpty(ticketId)) return false
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM TicketWatchers WHERE TicketId = ?').run(ticketId)
    db.prepare('DELETE FROM TicketAttachments WHERE TicketId = ?').run(ticketId)
    db.prepare('DELETE FROM TicketActivity WHERE TicketId = ?').run(ticketId)
    db.prepare('DELETE FROM TicketCustomFieldValues WHERE TicketId = ?').run(ticketId)
    db.prepare('DELETE FROM Tickets WHERE Id = ?').run(ticketId)
  })
  tx()
  return true
}

export interface TicketWatcher {
  userId: string
  name: string
  email: string
  addedAt: string
}

export const listTicketWatchers = (ticketId: string): TicketWatcher[] => {
  const db = getDb()
  return db
    .prepare(
      `SELECT u.Id AS userId, u.Name AS name, u.Email AS email, tw.AddedAt AS addedAt
       FROM TicketWatchers tw
       JOIN Users u ON tw.UserId = u.Id
       WHERE tw.TicketId = ?
       ORDER BY tw.AddedAt ASC`,
    )
    .all(ticketId) as TicketWatcher[]
}

export const addTicketWatcher = (ticketId: string, userId: string): boolean => {
  const db = getDb()
  try {
    db.prepare(
      "INSERT OR IGNORE INTO TicketWatchers (TicketId, UserId, AddedAt) VALUES (?, ?, datetime('now'))",
    ).run(ticketId, userId)
    return true
  } catch {
    return false
  }
}

export const removeTicketWatcher = (ticketId: string, userId: string): boolean => {
  const db = getDb()
  const result = db.prepare('DELETE FROM TicketWatchers WHERE TicketId = ? AND UserId = ?').run(ticketId, userId)
  return result.changes > 0
}

export const listWatchedTicketIds = (userId: string): string[] => {
  const db = getDb()
  return (
    db.prepare('SELECT TicketId AS ticketId FROM TicketWatchers WHERE UserId = ?').all(userId) as {
      ticketId: string
    }[]
  ).map((r) => r.ticketId)
}

export const upsertCustomFieldValues = (
  ticketId: string,
  teamId: string,
  fields: { fieldId: string; value: string }[],
): void => {
  if (!fields.length) return
  const db = getDb()
  const defs = db
    .prepare('SELECT Id, Label, FieldType FROM TicketFieldDefinitions WHERE TeamId = ?')
    .all(teamId) as { Id: string; Label: string; FieldType: string }[]
  const defMap = new Map(defs.map((d) => [d.Id, d]))
  const validFields = fields.filter((f) => defMap.has(f.fieldId))
  if (!validFields.length) return
  const tx = db.transaction(() => {
    for (const f of validFields) {
      const def = defMap.get(f.fieldId)!
      db.prepare('DELETE FROM TicketCustomFieldValues WHERE TicketId = ? AND FieldId = ?').run(ticketId, f.fieldId)
      db.prepare(
        `INSERT INTO TicketCustomFieldValues (Id, TicketId, FieldId, FieldLabel, FieldType, Value, CreatedAt)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      ).run(`tcfv-${crypto.randomUUID()}`, ticketId, f.fieldId, def.Label, def.FieldType, f.value)
    }
  })
  tx()
}
