import crypto from 'node:crypto'

import { getDb, dbAll, dbGet } from './db.js'

export type CustomFieldType = 'text' | 'select' | 'checkbox' | 'number' | 'date'

export type BuiltInFieldKey =
  | 'title'
  | 'requestorName'
  | 'requestorEmail'
  | 'categoryId'
  | 'priority'
  | 'assignedToId'
  | 'location'
  | 'description'
  | 'status'

export type LayoutSlotWidth = 'full' | 'half'

export interface TicketLayoutSlot {
  fieldRef: BuiltInFieldKey | string
  width: LayoutSlotWidth
}

export interface TicketLayoutRow {
  id: string
  slots: TicketLayoutSlot[]
}

export interface TicketLayout {
  rows: TicketLayoutRow[]
}

const LOCKED_BUILT_INS: BuiltInFieldKey[] = ['title', 'requestorName', 'requestorEmail']

const isBuiltInFieldKey = (value: unknown): value is BuiltInFieldKey =>
  typeof value === 'string' &&
  [
    'title',
    'requestorName',
    'requestorEmail',
    'categoryId',
    'priority',
    'assignedToId',
    'location',
    'description',
    'status',
  ].includes(value)

const normalizeLayout = (
  layout: unknown,
  customFieldIds: Set<string>,
): { layout: TicketLayout; errors: string[] } => {
  const errors: string[] = []
  const rows: TicketLayoutRow[] = []

  const candidate = typeof layout === 'object' && layout !== null ? (layout as { rows?: unknown }) : { rows: [] }
  const rowArray = Array.isArray(candidate.rows) ? candidate.rows : []

  const seenFieldRefs = new Set<string>()

  for (const row of rowArray) {
    if (typeof row !== 'object' || row === null || !Array.isArray((row as { slots?: unknown }).slots)) {
      continue
    }
    const rowId = typeof (row as { id?: unknown }).id === 'string' ? ((row as { id: string }).id) : `row-${crypto.randomUUID()}`
    const slots: TicketLayoutSlot[] = []

    for (const slot of (row as { slots: unknown[] }).slots) {
      if (typeof slot !== 'object' || slot === null) continue
      const fieldRefRaw = (slot as { fieldRef?: unknown }).fieldRef
      const fieldRef = isBuiltInFieldKey(fieldRefRaw) || (typeof fieldRefRaw === 'string' && customFieldIds.has(fieldRefRaw))
        ? String(fieldRefRaw)
        : null
      if (fieldRef === null) {
        if (typeof fieldRefRaw === 'string') errors.push(`Unknown field reference removed: ${fieldRefRaw}`)
        continue
      }
      if (seenFieldRefs.has(fieldRef)) {
        errors.push(`Duplicate field reference removed: ${fieldRef}`)
        continue
      }
      seenFieldRefs.add(fieldRef)

      const width = (slot as { width?: unknown }).width === 'half' ? 'half' : 'full'
      slots.push({ fieldRef, width })
    }

    // Cap each row at two half-width slots or one full-width slot.
    // Empty rows are preserved so the layout editor can use them as containers.
    if (slots.some((s) => s.width === 'full') && slots.length > 1) {
      errors.push('Row with a full-width slot can only contain one slot; trimmed.')
      rows.push({ id: rowId, slots: [slots[0]] })
    } else if (slots.filter((s) => s.width === 'half').length > 2) {
      errors.push('Row can contain at most two half-width slots; trimmed.')
      rows.push({ id: rowId, slots: slots.slice(0, 2) })
    } else {
      rows.push({ id: rowId, slots })
    }
  }

  // Ensure locked built-ins are present
  for (const key of LOCKED_BUILT_INS) {
    if (!seenFieldRefs.has(key)) {
      rows.unshift({ id: `row-locked-${key}`, slots: [{ fieldRef: key, width: 'full' }] })
      errors.push(`Required field ${key} was missing and has been added.`)
    }
  }

  return { layout: { rows }, errors }
}

export const getTicketLayout = async (organizationId: string): Promise<TicketLayout> => {
  const db = getDb()
  const row = await dbGet(db, 'SELECT LayoutJson FROM TicketLayouts WHERE OrganizationId = ?', [organizationId])
  if (!row?.LayoutJson) {
    return { rows: [
      { id: 'row-default-1', slots: [{ fieldRef: 'title', width: 'full' }] },
      { id: 'row-default-2', slots: [{ fieldRef: 'requestorName', width: 'half' }, { fieldRef: 'requestorEmail', width: 'half' }] },
      { id: 'row-default-3', slots: [{ fieldRef: 'categoryId', width: 'half' }, { fieldRef: 'priority', width: 'half' }] },
      { id: 'row-default-4', slots: [{ fieldRef: 'assignedToId', width: 'half' }, { fieldRef: 'location', width: 'half' }] },
      { id: 'row-default-5', slots: [{ fieldRef: 'description', width: 'full' }] },
    ] }
  }
  const customFieldRows = await dbAll(db, 'SELECT Id AS id FROM TicketFieldDefinitions WHERE OrganizationId = ?', [organizationId])
  const customFieldIds = new Set(customFieldRows.map((r) => String(r.id)))
  const parsed = (() => {
    try {
      return JSON.parse(String(row.LayoutJson))
    } catch {
      return { rows: [] }
    }
  })()
  const { layout } = normalizeLayout(parsed, customFieldIds)
  return layout
}

export const saveTicketLayout = async (
  organizationId: string,
  layout: TicketLayout,
): Promise<{ layout: TicketLayout; errors: string[] }> => {
  const db = getDb()
  const customFieldRows = await dbAll(db, 'SELECT Id AS id FROM TicketFieldDefinitions WHERE OrganizationId = ?', [organizationId])
  const customFieldIds = new Set(customFieldRows.map((r) => String(r.id)))
  const { layout: normalized, errors } = normalizeLayout(layout, customFieldIds)

  await db.execute({
    sql: `INSERT INTO TicketLayouts (Id, OrganizationId, LayoutJson)
          VALUES (?, ?, ?)
          ON CONFLICT(OrganizationId) DO UPDATE SET
            LayoutJson = excluded.LayoutJson, UpdatedAt = datetime('now')`,
    args: [`layout-${organizationId}`, organizationId, JSON.stringify(normalized)],
  })

  return { layout: normalized, errors }
}
