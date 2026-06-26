import crypto from 'node:crypto'

import { getDb, dbAll } from './db.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CustomFieldType = 'text' | 'select' | 'checkbox' | 'number' | 'date'

export interface TicketFieldDefinition {
  id: string
  teamId: string
  fieldType: CustomFieldType
  label: string
  isRequired: boolean
  sortOrder: number
  options: string[]
}

const VALID_FIELD_TYPES = new Set<string>(['text', 'select', 'checkbox', 'number', 'date'])

const safeParseJsonArray = (json: string): string[] => {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

type FieldRow = {
  id: unknown
  teamId: unknown
  fieldType: unknown
  label: unknown
  isRequired: unknown
  sortOrder: unknown
  optionsJson: unknown
}

const mapFieldRow = (row: FieldRow): TicketFieldDefinition => ({
  id: String(row.id),
  teamId: String(row.teamId),
  fieldType: String(row.fieldType) as CustomFieldType,
  label: String(row.label),
  isRequired: Number(row.isRequired) === 1,
  sortOrder: Number(row.sortOrder),
  options: safeParseJsonArray(String(row.optionsJson)),
})

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export const getTicketFieldDefinitions = async (teamId: string): Promise<TicketFieldDefinition[]> => {
  const db = getDb()
  const rows = await dbAll(db, 'SELECT Id AS id, TeamId AS teamId, FieldType AS fieldType, Label AS label, IsRequired AS isRequired, SortOrder AS sortOrder, OptionsJson AS optionsJson FROM TicketFieldDefinitions WHERE TeamId = ? ORDER BY SortOrder ASC', [teamId]) as FieldRow[]
  return rows.map(mapFieldRow)
}

export const saveTicketFieldDefinitions = async (
  teamId: string,
  rawFields: Array<Partial<TicketFieldDefinition>>,
): Promise<TicketFieldDefinition[]> => {
  const validFields = rawFields.flatMap((f, idx) => {
    const label = typeof f.label === 'string' ? f.label.trim() : ''
    const fieldType = typeof f.fieldType === 'string' ? f.fieldType : ''
    if (!label || !VALID_FIELD_TYPES.has(fieldType)) return []
    return [{
      id: typeof f.id === 'string' && f.id.trim() ? f.id.trim() : `tfd-${crypto.randomUUID()}`,
      teamId,
      fieldType,
      label,
      isRequired: f.isRequired === true ? 1 : 0,
      sortOrder: idx,
      optionsJson: JSON.stringify(
        Array.isArray(f.options)
          ? f.options.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          : [],
      ),
    }]
  })

  const db = getDb()
  const statements = [
    { sql: 'DELETE FROM TicketFieldDefinitions WHERE TeamId = ?', args: [teamId] },
    ...validFields.map((f) => ({
      sql: 'INSERT INTO TicketFieldDefinitions (Id, TeamId, FieldType, Label, IsRequired, SortOrder, OptionsJson) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [f.id, f.teamId, f.fieldType, f.label, f.isRequired, f.sortOrder, f.optionsJson],
    })),
  ]
  await db.batch(statements, 'write')

  return getTicketFieldDefinitions(teamId)
}
