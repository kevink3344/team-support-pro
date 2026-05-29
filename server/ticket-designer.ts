import crypto from 'node:crypto'

import { getDb } from './db.js'

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
  id: string
  teamId: string
  fieldType: string
  label: string
  isRequired: number
  sortOrder: number
  optionsJson: string
}

const mapFieldRow = (row: FieldRow): TicketFieldDefinition => ({
  id: row.id,
  teamId: row.teamId,
  fieldType: row.fieldType as CustomFieldType,
  label: row.label,
  isRequired: row.isRequired === 1,
  sortOrder: row.sortOrder,
  options: safeParseJsonArray(row.optionsJson),
})

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export const getTicketFieldDefinitions = (teamId: string): TicketFieldDefinition[] => {
  const db = getDb()
  const rows = db
    .prepare(
      'SELECT Id AS id, TeamId AS teamId, FieldType AS fieldType, Label AS label, IsRequired AS isRequired, SortOrder AS sortOrder, OptionsJson AS optionsJson FROM TicketFieldDefinitions WHERE TeamId = ? ORDER BY SortOrder ASC',
    )
    .all(teamId) as FieldRow[]
  return rows.map(mapFieldRow)
}

export const saveTicketFieldDefinitions = (
  teamId: string,
  rawFields: Array<Partial<TicketFieldDefinition>>,
): TicketFieldDefinition[] => {
  const db = getDb()

  const validFields = rawFields.flatMap((f, idx) => {
    const label = typeof f.label === 'string' ? f.label.trim() : ''
    const fieldType = typeof f.fieldType === 'string' ? f.fieldType : ''
    if (!label || !VALID_FIELD_TYPES.has(fieldType)) return []

    return [
      {
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
      },
    ]
  })

  const ins = db.prepare(
    "INSERT INTO TicketFieldDefinitions (Id, TeamId, FieldType, Label, IsRequired, SortOrder, OptionsJson) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM TicketFieldDefinitions WHERE TeamId = ?').run(teamId)
    for (const f of validFields) {
      ins.run(f.id, f.teamId, f.fieldType, f.label, f.isRequired, f.sortOrder, f.optionsJson)
    }
  })
  tx()

  return getTicketFieldDefinitions(teamId)
}
