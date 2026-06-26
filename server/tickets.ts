import crypto from 'node:crypto'

import { getDb, dbGet, dbAll, dbRun, type Client } from './db.js'

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
  const row = await dbGet(db, 'SELECT 1 AS allowed FROM Tickets WHERE Id = ? AND TeamId = ?', [ticketId, teamId])
  return !!row
}

export const listTicketActivity = async (): Promise<TicketActivityRecord[]> => {
  const db = getDb()
  const rows = await dbAll(db, 'SELECT Id AS id, TicketId AS ticketId, Actor AS actor, Message AS message, ActivityAt AS activityAt FROM TicketActivity')
  return rows.map(mapActivityRecord)
}

export const listTickets = async (teamId?: string): Promise<TicketRecord[]> => {
  const db = getDb()
  const ticketSql = `SELECT Id AS id, Title AS title, Description AS description, Status AS status, Priority AS priority, TeamId AS teamId, CategoryId AS categoryId, AssignedToId AS assignedToId, RequestorName AS requestorName, RequestorEmail AS requestorEmail, Location AS location, DueLabel AS dueLabel, CreatedAt AS createdAt, UpdatedAt AS updatedAt, ResolvedAt AS resolvedAt, (SELECT COUNT(1) FROM TicketAttachments ta WHERE ta.TicketId = Tickets.Id AND ta.IsDeleted = 0) AS attachmentCount FROM Tickets${teamId ? ' WHERE TeamId = ?' : ''} ORDER BY UpdatedAt DESC, CreatedAt DESC`
  const ticketRows = await dbAll(db, ticketSql, teamId ? [teamId] : [])
  const tickets = ticketRows.map(mapTicketRecord)
  const allActivity = await listTicketActivity()
  const ticketIds = new Set(tickets.map((t) => t.id))

  const cfSql = `SELECT Id AS id, TicketId AS ticketId, FieldId AS fieldId, FieldLabel AS fieldLabel, FieldType AS fieldType, Value AS value FROM TicketCustomFieldValues WHERE TicketId IN (SELECT Id FROM Tickets${teamId ? ' WHERE TeamId = ?' : ''}) ORDER BY rowid ASC`
  const cfRows = await dbAll(db, cfSql, teamId ? [teamId] : []) as Array<{ id: unknown; ticketId: unknown; fieldId: unknown; fieldLabel: unknown; fieldType: unknown; value: unknown }>

  const customFieldsByTicket = new Map<string, TicketCustomFieldValue[]>()
  for (const row of cfRows) {
    const ticketId = String(row.ticketId)
    const current = customFieldsByTicket.get(ticketId) ?? []
    current.push({ id: String(row.id), ticketId, fieldId: String(row.fieldId), fieldLabel: String(row.fieldLabel), fieldType: String(row.fieldType), value: String(row.value) })
    customFieldsByTicket.set(ticketId, current)
  }

  return groupTicketsWithActivity(tickets, allActivity.filter((a) => ticketIds.has(a.ticketId)), customFieldsByTicket)
}

const getCustomFieldValues = async (db: Client, ticketId: string): Promise<TicketCustomFieldValue[]> => {
  const rows = await dbAll(db, 'SELECT Id AS id, TicketId AS ticketId, FieldId AS fieldId, FieldLabel AS fieldLabel, FieldType AS fieldType, Value AS value FROM TicketCustomFieldValues WHERE TicketId = ? ORDER BY rowid ASC', [ticketId]) as Array<{ id: unknown; ticketId: unknown; fieldId: unknown; fieldLabel: unknown; fieldType: unknown; value: unknown }>
  return rows.map((row) => ({ id: String(row.id), ticketId: String(row.ticketId), fieldId: String(row.fieldId), fieldLabel: String(row.fieldLabel), fieldType: String(row.fieldType), value: String(row.value) }))
}

export const getTicketById = async (ticketId: string): Promise<TicketRecord | null> => {
  const db = getDb()
  const row = await dbGet(db, `SELECT Id AS id, Title AS title, Description AS description, Status AS status, Priority AS priority, TeamId AS teamId, CategoryId AS categoryId, AssignedToId AS assignedToId, RequestorName AS requestorName, RequestorEmail AS requestorEmail, Location AS location, DueLabel AS dueLabel, CreatedAt AS createdAt, UpdatedAt AS updatedAt, ResolvedAt AS resolvedAt, (SELECT COUNT(1) FROM TicketAttachments ta WHERE ta.TicketId = Tickets.Id AND ta.IsDeleted = 0) AS attachmentCount FROM Tickets WHERE Id = ?`, [ticketId])
  if (!row) return null
  const ticket = mapTicketRecord(row)
  const activityRows = await dbAll(db, 'SELECT Id AS id, TicketId AS ticketId, Actor AS actor, Message AS message, ActivityAt AS activityAt FROM TicketActivity WHERE TicketId = ? ORDER BY ActivityAt ASC', [ticketId])
  const customFields = await getCustomFieldValues(db, ticketId)
  return { ...ticket, activity: activityRows.map(mapActivityRecord), customFields }
}

export const createTicketComment = async (input: { ticketId: string; actor: string; message: string }): Promise<TicketActivityRecord> => {
  const db = getDb()
  const activityAt = new Date().toISOString()
  const id = `comment-${crypto.randomUUID()}`
  await db.batch([
    { sql: 'INSERT INTO TicketActivity (Id, TicketId, Actor, Message, ActivityAt) VALUES (?, ?, ?, ?, ?)', args: [id, input.ticketId, input.actor, input.message, activityAt] },
    { sql: 'UPDATE Tickets SET UpdatedAt = ? WHERE Id = ?', args: [activityAt, input.ticketId] },
  ], 'write')
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
    const [fromTeam, toTeam] = await Promise.all([
      dbGet(db, 'SELECT Name FROM Teams WHERE Id = ?', [existing.teamId]),
      dbGet(db, 'SELECT Name FROM Teams WHERE Id = ?', [input.teamId]),
    ])
    const fromName = typeof fromTeam?.Name === 'string' ? fromTeam.Name.trim() : 'Unknown'
    const toName = typeof toTeam?.Name === 'string' ? toTeam.Name.trim() : 'Unknown'
    changeMessages.push(`Transferred ticket from ${fromName} to ${toName}.`)
  }
  if (existing.assignedToId !== input.assignedToId) {
    const getName = async (id: string | null) => {
      if (!id) return 'Unassigned'
      const r = await dbGet(db, 'SELECT Name FROM Users WHERE Id = ?', [id])
      return typeof r?.Name === 'string' && r.Name.trim() ? r.Name.trim() : 'Unknown'
    }
    const [fromName, toName] = await Promise.all([getName(existing.assignedToId), getName(input.assignedToId)])
    changeMessages.push(`Reassigned ticket from ${fromName} to ${toName}.`)
  }
  if (existing.categoryId !== input.categoryId) {
    const [fromCat, toCat] = await Promise.all([
      dbGet(db, 'SELECT Name FROM Categories WHERE Id = ?', [existing.categoryId]),
      dbGet(db, 'SELECT Name FROM Categories WHERE Id = ?', [input.categoryId]),
    ])
    const fromName = typeof fromCat?.Name === 'string' ? fromCat.Name.trim() : 'Unknown'
    const toName = typeof toCat?.Name === 'string' ? toCat.Name.trim() : 'Unknown'
    changeMessages.push(`Updated category from ${fromName} to ${toName}.`)
  }
  if (existing.title !== input.title) changeMessages.push('Updated ticket title.')
  if (existing.description !== input.description) changeMessages.push('Updated ticket description.')
  if (existing.location !== input.location) changeMessages.push('Updated ticket location.')
  if (existing.requestorName !== input.requestorName) changeMessages.push('Updated requester name.')
  if (existing.requestorEmail !== input.requestorEmail.trim().toLowerCase()) changeMessages.push('Updated requester email.')

  const resolvedStatuses = new Set(['Resolved', 'Closed'])
  const newResolvedAt = resolvedStatuses.has(input.status) ? (existing.resolvedAt ?? activityAt) : null

  const statements = [
    {
      sql: 'UPDATE Tickets SET Title = ?, Description = ?, Status = ?, Priority = ?, TeamId = ?, CategoryId = ?, AssignedToId = ?, RequestorName = ?, RequestorEmail = ?, Location = ?, UpdatedAt = ?, ResolvedAt = ? WHERE Id = ?',
      args: [input.title.trim(), input.description.trim(), input.status, input.priority, input.teamId, input.categoryId, input.assignedToId, input.requestorName.trim(), input.requestorEmail.trim().toLowerCase(), input.location.trim() || 'Not specified', activityAt, newResolvedAt, ticketId],
    },
    ...changeMessages.map((msg) => ({
      sql: 'INSERT INTO TicketActivity (Id, TicketId, Actor, Message, ActivityAt) VALUES (?, ?, ?, ?, ?)',
      args: [`activity-${crypto.randomUUID()}`, ticketId, actor, msg, activityAt],
    })),
  ]
  await db.batch(statements, 'write')
  return getTicketById(ticketId)
}

export const createTicket = async (input: CreateTicketInput, actor: string): Promise<TicketRecord | null> => {
  if (!validateCreateTicketInput(input)) return null
  const db = getDb()
  const catRow = await dbGet(db, 'SELECT TeamId FROM Categories WHERE Id = ?', [input.categoryId])
  if (!catRow?.TeamId || catRow.TeamId !== input.teamId) return null
  if (input.assignedToId) {
    const userRow = await dbGet(db, 'SELECT TeamId FROM Users WHERE Id = ?', [input.assignedToId])
    if (!userRow?.TeamId || userRow.TeamId !== input.teamId) return null
  }
  let ticketId = input.id?.trim() || generateTicketId()
  while (await getTicketById(ticketId)) ticketId = generateTicketId()
  const createdAt = new Date().toISOString()

  type FieldDefRow = { id: unknown; fieldType: unknown; label: unknown; isRequired: unknown }
  const fieldDefs = await dbAll(db, 'SELECT Id AS id, FieldType AS fieldType, Label AS label, IsRequired AS isRequired FROM TicketFieldDefinitions WHERE TeamId = ?', [input.teamId]) as FieldDefRow[]
  const fieldDefMap = new Map(fieldDefs.map((f) => [String(f.id), f]))

  const customFieldInserts: Array<{ id: string; fieldId: string; fieldLabel: string; fieldType: string; value: string }> = []
  if (Array.isArray(input.customFields)) {
    for (const cf of input.customFields) {
      const def = fieldDefMap.get(cf.fieldId)
      if (!def) continue
      customFieldInserts.push({
        id: `tcfv-${crypto.randomUUID()}`,
        fieldId: String(def.id),
        fieldLabel: String(def.label),
        fieldType: String(def.fieldType),
        value: String(cf.value ?? ''),
      })
    }
  }

  const statements = [
    {
      sql: `INSERT INTO Tickets (Id, Title, Description, Status, Priority, TeamId, CategoryId, AssignedToId, RequestorName, RequestorEmail, Location, DueLabel, CreatedAt, UpdatedAt) VALUES (?, ?, ?, 'Open', ?, ?, ?, ?, ?, ?, ?, 'New in queue', ?, ?)`,
      args: [ticketId, input.title.trim(), input.description.trim(), input.priority, input.teamId, input.categoryId, input.assignedToId, input.requestorName.trim(), input.requestorEmail.trim().toLowerCase(), input.location.trim() || 'Not specified', createdAt, createdAt],
    },
    {
      sql: 'INSERT INTO TicketActivity (Id, TicketId, Actor, Message, ActivityAt) VALUES (?, ?, ?, ?, ?)',
      args: [`activity-${crypto.randomUUID()}`, ticketId, actor, 'Ticket created from TeamSupportPro.', createdAt],
    },
    ...customFieldInserts.map((cf) => ({
      sql: 'INSERT INTO TicketCustomFieldValues (Id, TicketId, FieldId, FieldLabel, FieldType, Value) VALUES (?, ?, ?, ?, ?, ?)',
      args: [cf.id, ticketId, cf.fieldId, cf.fieldLabel, cf.fieldType, cf.value],
    })),
  ]
  await db.batch(statements, 'write')
  return getTicketById(ticketId)
}

export const deleteTicket = async (ticketId: string): Promise<boolean> => {
  if (!isNonEmpty(ticketId)) return false
  const db = getDb()
  await db.batch([
    { sql: 'DELETE FROM TicketWatchers WHERE TicketId = ?', args: [ticketId] },
    { sql: 'DELETE FROM TicketAttachments WHERE TicketId = ?', args: [ticketId] },
    { sql: 'DELETE FROM TicketActivity WHERE TicketId = ?', args: [ticketId] },
    { sql: 'DELETE FROM TicketCustomFieldValues WHERE TicketId = ?', args: [ticketId] },
    { sql: 'DELETE FROM Tickets WHERE Id = ?', args: [ticketId] },
  ], 'write')
  return true
}

export interface TicketWatcher {
  userId: string
  name: string
  email: string
  addedAt: string
}

export const listTicketWatchers = async (ticketId: string): Promise<TicketWatcher[]> => {
  const db = getDb()
  const rows = await dbAll(db, `
    SELECT u.Id AS userId, u.Name AS name, u.Email AS email, tw.AddedAt AS addedAt
    FROM TicketWatchers tw
    JOIN Users u ON tw.UserId = u.Id
    WHERE tw.TicketId = ?
    ORDER BY tw.AddedAt ASC
  `, [ticketId]) as Array<{ userId: unknown; name: unknown; email: unknown; addedAt: unknown }>
  return rows.map((r) => ({ userId: String(r.userId), name: String(r.name), email: String(r.email), addedAt: String(r.addedAt) }))
}

export const addTicketWatcher = async (ticketId: string, userId: string): Promise<boolean> => {
  const db = getDb()
  try {
    await dbRun(db, "INSERT OR IGNORE INTO TicketWatchers (TicketId, UserId, AddedAt) VALUES (?, ?, datetime('now'))", [ticketId, userId])
    return true
  } catch {
    return false
  }
}

export const removeTicketWatcher = async (ticketId: string, userId: string): Promise<boolean> => {
  const db = getDb()
  const result = await dbRun(db, 'DELETE FROM TicketWatchers WHERE TicketId = ? AND UserId = ?', [ticketId, userId])
  return result.rowsAffected > 0
}

export const listWatchedTicketIds = async (userId: string): Promise<string[]> => {
  const db = getDb()
  const rows = await dbAll(db, 'SELECT TicketId AS ticketId FROM TicketWatchers WHERE UserId = ?', [userId]) as Array<{ ticketId: unknown }>
  return rows.map((r) => String(r.ticketId))
}

export const upsertCustomFieldValues = async (
  ticketId: string,
  teamId: string,
  fields: { fieldId: string; value: string }[],
): Promise<void> => {
  if (!fields.length) return
  const db = getDb()
  const defs = await dbAll(db, 'SELECT Id, Label, FieldType FROM TicketFieldDefinitions WHERE TeamId = ?', [teamId]) as Array<{ Id: unknown; Label: unknown; FieldType: unknown }>
  const defMap = new Map(defs.map((d) => [String(d.Id), d]))
  const validFields = fields.filter((f) => defMap.has(f.fieldId))
  if (!validFields.length) return

  const statements: Array<{ sql: string; args: unknown[] }> = []
  for (const f of validFields) {
    const def = defMap.get(f.fieldId)!
    statements.push({ sql: 'DELETE FROM TicketCustomFieldValues WHERE TicketId = ? AND FieldId = ?', args: [ticketId, f.fieldId] })
    statements.push({
      sql: `INSERT INTO TicketCustomFieldValues (Id, TicketId, FieldId, FieldLabel, FieldType, Value, CreatedAt) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [`tcfv-${crypto.randomUUID()}`, ticketId, f.fieldId, String(def.Label), String(def.FieldType), f.value],
    })
  }
  await db.batch(statements as Array<{ sql: string; args: import('@libsql/client').InValue[] }>, 'write')
}
