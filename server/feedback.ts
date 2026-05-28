import crypto from 'node:crypto'

import { serverConfig } from './config.js'
import { getDb } from './db.js'
import type { TicketRecord } from './tickets.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeedbackFieldType = 'short_text' | 'long_text' | 'rating' | 'single_choice' | 'multi_choice'

export interface FeedbackFormField {
  id: string
  formId: string
  fieldType: FeedbackFieldType
  label: string
  isRequired: boolean
  sortOrder: number
  options: string[]
}

export interface FeedbackForm {
  id: string
  organizationId: string
  isEnabled: boolean
  fields: FeedbackFormField[]
}

export interface FeedbackResponseSummary {
  id: string
  token: string
  ticketId: string | null
  organizationId: string
  teamId: string | null
  categoryId: string | null
  requestorEmail: string | null
  isTest: boolean
  submittedAt: string
  answers: Array<{ fieldId: string; fieldLabel: string; fieldType: string; value: string }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_FIELD_TYPES = new Set<string>([
  'short_text',
  'long_text',
  'rating',
  'single_choice',
  'multi_choice',
])

const TOKEN_EXPIRY_DAYS = 7
const TEST_TOKEN_EXPIRY_HOURS = 1

const safeParseJsonArray = (json: string): string[] => {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Form CRUD
// ---------------------------------------------------------------------------

export const getFeedbackForm = (orgId: string): FeedbackForm => {
  const db = getDb()

  type FormRow = { id: string; organizationId: string; isEnabled: number }
  let formRow = db
    .prepare(
      'SELECT Id AS id, OrganizationId AS organizationId, IsEnabled AS isEnabled FROM FeedbackForms WHERE OrganizationId = ? LIMIT 1',
    )
    .get(orgId) as FormRow | undefined

  if (!formRow) {
    const id = `ff-${crypto.randomUUID()}`
    db.prepare('INSERT INTO FeedbackForms (Id, OrganizationId, IsEnabled) VALUES (?, ?, 0)').run(id, orgId)
    formRow = { id, organizationId: orgId, isEnabled: 0 }
  }

  type FieldRow = {
    id: string
    formId: string
    fieldType: string
    label: string
    isRequired: number
    sortOrder: number
    optionsJson: string
  }

  const fieldRows = db
    .prepare(
      'SELECT Id AS id, FormId AS formId, FieldType AS fieldType, Label AS label, IsRequired AS isRequired, SortOrder AS sortOrder, OptionsJson AS optionsJson FROM FeedbackFormFields WHERE FormId = ? ORDER BY SortOrder ASC',
    )
    .all(formRow.id) as FieldRow[]

  return {
    id: formRow.id,
    organizationId: formRow.organizationId,
    isEnabled: formRow.isEnabled === 1,
    fields: fieldRows.map((f) => ({
      id: f.id,
      formId: f.formId,
      fieldType: f.fieldType as FeedbackFieldType,
      label: f.label,
      isRequired: f.isRequired === 1,
      sortOrder: f.sortOrder,
      options: safeParseJsonArray(f.optionsJson),
    })),
  }
}

export const saveFeedbackFormFields = (
  orgId: string,
  rawFields: Array<Partial<FeedbackFormField>>,
): FeedbackForm => {
  const db = getDb()
  const form = getFeedbackForm(orgId)

  const validFields = rawFields.flatMap((f, idx) => {
    const label = typeof f.label === 'string' ? f.label.trim() : ''
    const fieldType = typeof f.fieldType === 'string' ? f.fieldType : ''
    if (!label || !VALID_FIELD_TYPES.has(fieldType)) return []

    return [
      {
        id:
          typeof f.id === 'string' && f.id.trim() ? f.id.trim() : `fff-${crypto.randomUUID()}`,
        formId: form.id,
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

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM FeedbackFormFields WHERE FormId = ?').run(form.id)
    const ins = db.prepare(
      'INSERT INTO FeedbackFormFields (Id, FormId, FieldType, Label, IsRequired, SortOrder, OptionsJson) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    for (const f of validFields) {
      ins.run(f.id, f.formId, f.fieldType, f.label, f.isRequired, f.sortOrder, f.optionsJson)
    }
    db.prepare("UPDATE FeedbackForms SET UpdatedAt = datetime('now') WHERE Id = ?").run(form.id)
  })
  tx()

  return getFeedbackForm(orgId)
}

export const setFeedbackFormEnabled = (orgId: string, isEnabled: boolean): FeedbackForm => {
  const form = getFeedbackForm(orgId) // ensures row exists
  const db = getDb()
  db.prepare("UPDATE FeedbackForms SET IsEnabled = ?, UpdatedAt = datetime('now') WHERE Id = ?").run(
    isEnabled ? 1 : 0,
    form.id,
  )
  return getFeedbackForm(orgId)
}

// ---------------------------------------------------------------------------
// Global enable / disable
// ---------------------------------------------------------------------------

export const readFeedbackFormGlobalEnabled = (): boolean => {
  const db = getDb()
  const row = db
    .prepare("SELECT Value AS value FROM AppSettings WHERE Key = 'feedbackFormEnabled' LIMIT 1")
    .get() as { value?: string } | undefined
  return row?.value === 'true'
}

export const writeFeedbackFormGlobalEnabled = (enabled: boolean): void => {
  const db = getDb()
  db.prepare(
    "INSERT INTO AppSettings (Key, Value, UpdatedAt) VALUES ('feedbackFormEnabled', ?, datetime('now')) ON CONFLICT(Key) DO UPDATE SET Value = excluded.Value, UpdatedAt = datetime('now')",
  ).run(enabled ? 'true' : 'false')
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export const createFeedbackToken = (ticketId: string, orgId: string): string => {
  const db = getDb()
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 86400 * 1000).toISOString()
  db.prepare(
    'INSERT INTO FeedbackTokens (Token, TicketId, OrganizationId, IsTest, ExpiresAt) VALUES (?, ?, ?, 0, ?)',
  ).run(token, ticketId, orgId, expiresAt)
  return token
}

export const createTestFeedbackToken = (orgId: string): string => {
  const db = getDb()
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TEST_TOKEN_EXPIRY_HOURS * 3600 * 1000).toISOString()
  db.prepare(
    'INSERT INTO FeedbackTokens (Token, TicketId, OrganizationId, IsTest, ExpiresAt) VALUES (?, NULL, ?, 1, ?)',
  ).run(token, orgId, expiresAt)
  return token
}

type TokenStatus = 'valid' | 'invalid' | 'expired' | 'used'

interface ResolvedToken {
  token: string
  ticketId: string | null
  organizationId: string
  isTest: boolean
  expiresAt: string
  usedAt: string | null
}

export const resolveToken = (
  token: string,
): { status: TokenStatus; data?: ResolvedToken } => {
  if (!/^[0-9a-f]{64}$/.test(token)) return { status: 'invalid' }

  const db = getDb()
  const row = db
    .prepare(
      'SELECT Token AS token, TicketId AS ticketId, OrganizationId AS organizationId, IsTest AS isTest, ExpiresAt AS expiresAt, UsedAt AS usedAt FROM FeedbackTokens WHERE Token = ? LIMIT 1',
    )
    .get(token) as (Omit<ResolvedToken, 'isTest'> & { isTest: number }) | undefined

  if (!row) return { status: 'invalid' }
  if (row.usedAt) return { status: 'used' }
  if (new Date(row.expiresAt) < new Date()) return { status: 'expired' }

  return {
    status: 'valid',
    data: { ...row, isTest: (row.isTest as unknown as number) === 1 },
  }
}

// ---------------------------------------------------------------------------
// Submit response
// ---------------------------------------------------------------------------

export interface FeedbackAnswerInput {
  fieldId: string
  value: string
}

export const submitFeedbackResponse = (
  tokenStr: string,
  answers: FeedbackAnswerInput[],
): { ok: boolean; error?: string } => {
  const resolution = resolveToken(tokenStr)
  if (resolution.status !== 'valid' || !resolution.data) {
    return { ok: false, error: resolution.status }
  }

  const { ticketId, organizationId, isTest } = resolution.data
  const db = getDb()
  const form = getFeedbackForm(organizationId)

  // Validate required fields
  for (const field of form.fields) {
    if (field.isRequired) {
      const answer = answers.find((a) => a.fieldId === field.id)
      if (!answer || !answer.value.trim()) {
        return { ok: false, error: 'required_field_missing' }
      }
    }
  }

  const fieldMap = new Map(form.fields.map((f) => [f.id, f]))
  const responseId = `fr-${crypto.randomUUID()}`
  const submittedAt = new Date().toISOString()
  const formSnapshotJson = JSON.stringify(form.fields)

  let teamId: string | null = null
  let categoryId: string | null = null
  let requestorEmail: string | null = null

  if (ticketId) {
    const ticketRow = db
      .prepare('SELECT TeamId, CategoryId, RequestorEmail FROM Tickets WHERE Id = ? LIMIT 1')
      .get(ticketId) as { TeamId: string; CategoryId: string; RequestorEmail: string } | undefined
    if (ticketRow) {
      teamId = ticketRow.TeamId
      categoryId = ticketRow.CategoryId
      requestorEmail = ticketRow.RequestorEmail
    }
  }

  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO FeedbackResponses (Id, Token, TicketId, OrganizationId, TeamId, CategoryId, RequestorEmail, IsTest, FormSnapshotJson, SubmittedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      responseId,
      tokenStr,
      ticketId,
      organizationId,
      teamId,
      categoryId,
      requestorEmail,
      isTest ? 1 : 0,
      formSnapshotJson,
      submittedAt,
    )

    const insAns = db.prepare(
      'INSERT INTO FeedbackResponseAnswers (Id, ResponseId, FieldId, FieldLabel, FieldType, Value) VALUES (?, ?, ?, ?, ?, ?)',
    )

    for (const answer of answers) {
      const field = fieldMap.get(answer.fieldId)
      if (!field) continue
      const sanitized = answer.value.trim()
      if (!sanitized) continue
      insAns.run(
        `fra-${crypto.randomUUID()}`,
        responseId,
        answer.fieldId,
        field.label,
        field.fieldType,
        sanitized,
      )
    }

    db.prepare('UPDATE FeedbackTokens SET UsedAt = ? WHERE Token = ?').run(submittedAt, tokenStr)
  })
  tx()

  return { ok: true }
}

// ---------------------------------------------------------------------------
// List responses
// ---------------------------------------------------------------------------

export const listFeedbackResponses = (
  orgId: string,
  includeTest = false,
): FeedbackResponseSummary[] => {
  const db = getDb()

  type ResponseRow = {
    id: string
    token: string
    ticketId: string | null
    organizationId: string
    teamId: string | null
    categoryId: string | null
    requestorEmail: string | null
    isTest: number
    submittedAt: string
  }

  const rows = db
    .prepare(
      `SELECT Id AS id, Token AS token, TicketId AS ticketId, OrganizationId AS organizationId,
        TeamId AS teamId, CategoryId AS categoryId, RequestorEmail AS requestorEmail,
        IsTest AS isTest, SubmittedAt AS submittedAt
       FROM FeedbackResponses
       WHERE OrganizationId = ? ${includeTest ? '' : 'AND IsTest = 0'}
       ORDER BY SubmittedAt DESC`,
    )
    .all(orgId) as ResponseRow[]

  type AnswerRow = {
    responseId: string
    fieldId: string
    fieldLabel: string
    fieldType: string
    value: string
  }

  const answerRows = db
    .prepare(
      `SELECT a.ResponseId AS responseId, a.FieldId AS fieldId, a.FieldLabel AS fieldLabel,
         a.FieldType AS fieldType, a.Value AS value
       FROM FeedbackResponseAnswers a
       JOIN FeedbackResponses r ON r.Id = a.ResponseId
       WHERE r.OrganizationId = ? ${includeTest ? '' : 'AND r.IsTest = 0'}`,
    )
    .all(orgId) as AnswerRow[]

  const answersByResponse = new Map<string, AnswerRow[]>()
  for (const a of answerRows) {
    const bucket = answersByResponse.get(a.responseId) ?? []
    bucket.push(a)
    answersByResponse.set(a.responseId, bucket)
  }

  return rows.map((r) => ({
    id: r.id,
    token: r.token,
    ticketId: r.ticketId,
    organizationId: r.organizationId,
    teamId: r.teamId,
    categoryId: r.categoryId,
    requestorEmail: r.requestorEmail,
    isTest: r.isTest === 1,
    submittedAt: r.submittedAt,
    answers: (answersByResponse.get(r.id) ?? []).map((a) => ({
      fieldId: a.fieldId,
      fieldLabel: a.fieldLabel,
      fieldType: a.fieldType,
      value: a.value,
    })),
  }))
}

// ---------------------------------------------------------------------------
// Send feedback email on ticket resolution
// ---------------------------------------------------------------------------

const buildFeedbackEmailHtml = (name: string, ticketTitle: string, feedbackUrl: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:4px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#0f172a;padding:20px 24px;">
      <span style="color:#fff;font-size:16px;font-weight:600;">TeamSupportPro</span>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;color:#1e293b;font-size:15px;">Hi ${name},</p>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;">
        Your support ticket <strong>"${ticketTitle}"</strong> has been resolved.
        We'd love to hear how we did — it only takes a minute!
      </p>
      <a href="${feedbackUrl}"
         style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 20px;border-radius:4px;font-size:14px;font-weight:500;margin:8px 0 20px;">
        Share Your Feedback →
      </a>
      <p style="margin:0;color:#94a3b8;font-size:12px;">
        This link expires in 7 days. If you did not request this, you can safely ignore this email.
      </p>
    </div>
  </div>
</body>
</html>`

export const maybeSendFeedbackEmail = async (
  ticket: TicketRecord,
  orgId: string,
): Promise<void> => {
  if (!readFeedbackFormGlobalEnabled()) return

  const form = getFeedbackForm(orgId)
  if (!form.isEnabled) return
  if (form.fields.length === 0) return
  if (!ticket.requestorEmail) return

  const { resendApiKey, from } = serverConfig.email
  if (!resendApiKey || !from) return

  const token = createFeedbackToken(ticket.id, orgId)
  const baseUrl = (serverConfig.allowedOrigins[0] ?? serverConfig.clientUrl).replace(/\/$/, '')
  const feedbackUrl = `${baseUrl}/feedback/${token}`

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(resendApiKey)
    await resend.emails.send({
      from,
      to: ticket.requestorEmail,
      subject: `How did we do? — ${ticket.title}`,
      html: buildFeedbackEmailHtml(ticket.requestorName, ticket.title, feedbackUrl),
      text: `Hi ${ticket.requestorName},\n\nYour support ticket "${ticket.title}" has been resolved. We'd love to hear how we did!\n\nShare your feedback: ${feedbackUrl}\n\nThis link expires in 7 days.\n\n— TeamSupportPro`,
    })
  } catch (err) {
    console.error('Failed to send feedback email:', err)
  }
}
