import crypto from 'crypto'
import { getDb } from './db.js'

export type WebhookEvent =
  | 'ticket.created'
  | 'ticket.updated'
  | 'ticket.assigned'
  | 'ticket.resolved'
  | 'ticket.closed'
  | 'feedback.submitted'

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  'ticket.created',
  'ticket.updated',
  'ticket.assigned',
  'ticket.resolved',
  'ticket.closed',
  'feedback.submitted',
]

export interface WebhookConfig {
  id: string
  organizationId: string
  url: string
  secret: string
  events: WebhookEvent[]
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}

interface WebhookConfigRow {
  Id: string
  OrganizationId: string
  Url: string
  Secret: string
  Events: string
  IsEnabled: number
  CreatedAt: string
  UpdatedAt: string
}

const mapRow = (row: WebhookConfigRow): WebhookConfig => ({
  id: row.Id,
  organizationId: row.OrganizationId,
  url: row.Url,
  secret: row.Secret,
  events: (() => {
    try {
      const parsed = JSON.parse(row.Events)
      return Array.isArray(parsed) ? (parsed as WebhookEvent[]) : []
    } catch {
      return []
    }
  })(),
  isEnabled: row.IsEnabled === 1,
  createdAt: row.CreatedAt,
  updatedAt: row.UpdatedAt,
})

export const listWebhookConfigs = (organizationId: string): WebhookConfig[] => {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM WebhookConfigs WHERE OrganizationId = ? ORDER BY CreatedAt ASC')
    .all(organizationId) as WebhookConfigRow[]
  return rows.map(mapRow)
}

export const getWebhookConfig = (id: string): WebhookConfig | null => {
  const db = getDb()
  const row = db.prepare('SELECT * FROM WebhookConfigs WHERE Id = ?').get(id) as WebhookConfigRow | undefined
  return row ? mapRow(row) : null
}

export interface CreateWebhookInput {
  url: string
  secret?: string
  events: WebhookEvent[]
  isEnabled?: boolean
}

const isValidUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export const createWebhookConfig = (
  organizationId: string,
  input: CreateWebhookInput,
): WebhookConfig | null => {
  const url = input.url.trim()
  if (!url || !isValidUrl(url)) return null
  const validEvents = input.events.filter((e) => (WEBHOOK_EVENTS as string[]).includes(e))
  if (!validEvents.length) return null

  const db = getDb()
  const id = `wh-${crypto.randomUUID()}`
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO WebhookConfigs (Id, OrganizationId, Url, Secret, Events, IsEnabled, CreatedAt, UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    organizationId,
    url,
    input.secret?.trim() ?? '',
    JSON.stringify(validEvents),
    input.isEnabled !== false ? 1 : 0,
    now,
    now,
  )
  return getWebhookConfig(id)
}

export interface UpdateWebhookInput {
  url?: string
  secret?: string
  events?: WebhookEvent[]
  isEnabled?: boolean
}

export const updateWebhookConfig = (
  id: string,
  input: UpdateWebhookInput,
): WebhookConfig | null => {
  const existing = getWebhookConfig(id)
  if (!existing) return null

  const url = input.url !== undefined ? input.url.trim() : existing.url
  if (!isValidUrl(url)) return null

  const events =
    input.events !== undefined
      ? input.events.filter((e) => (WEBHOOK_EVENTS as string[]).includes(e))
      : existing.events
  if (!events.length) return null

  const secret = input.secret !== undefined ? input.secret.trim() : existing.secret
  const isEnabled = input.isEnabled !== undefined ? input.isEnabled : existing.isEnabled
  const now = new Date().toISOString()

  const db = getDb()
  db.prepare(
    `UPDATE WebhookConfigs SET Url = ?, Secret = ?, Events = ?, IsEnabled = ?, UpdatedAt = ? WHERE Id = ?`,
  ).run(url, secret, JSON.stringify(events), isEnabled ? 1 : 0, now, id)
  return getWebhookConfig(id)
}

export const deleteWebhookConfig = (id: string): boolean => {
  const db = getDb()
  const result = db.prepare('DELETE FROM WebhookConfigs WHERE Id = ?').run(id)
  return result.changes > 0
}

const signPayload = (secret: string, body: string): string => {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(body)
  return `sha256=${hmac.digest('hex')}`
}

export const dispatchWebhookEvent = (
  organizationId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): void => {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT * FROM WebhookConfigs
       WHERE OrganizationId = ? AND IsEnabled = 1`,
    )
    .all(organizationId) as WebhookConfigRow[]

  const configs = rows.map(mapRow).filter((c) => c.events.includes(event))
  if (!configs.length) return

  const payload = JSON.stringify({
    event,
    occurredAt: new Date().toISOString(),
    organizationId,
    data,
  })

  for (const config of configs) {
    const deliveryId = crypto.randomUUID()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': event,
      'X-Webhook-Delivery': deliveryId,
    }
    if (config.secret) {
      headers['X-Hub-Signature-256'] = signPayload(config.secret, payload)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    fetch(config.url, {
      method: 'POST',
      headers,
      body: payload,
      signal: controller.signal,
    })
      .then(() => clearTimeout(timeout))
      .catch((err: unknown) => {
        clearTimeout(timeout)
        console.warn(`[webhook] delivery failed to ${config.url} (event: ${event}):`, err instanceof Error ? err.message : err)
      })
  }
}
