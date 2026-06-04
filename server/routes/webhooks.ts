import { Router } from 'express'
import { requireAdmin } from '../middleware.js'
import {
  readFeedbackFormGlobalEnabled,
  writeFeedbackFormGlobalEnabled,
} from '../feedback.js'
import {
  listWebhookConfigs,
  createWebhookConfig,
  updateWebhookConfig,
  deleteWebhookConfig,
  dispatchWebhookEvent,
  WEBHOOK_EVENTS,
  type CreateWebhookInput,
  type UpdateWebhookInput,
  type WebhookEvent,
} from '../webhooks.js'

export const webhooksRouter = Router()
webhooksRouter.use(requireAdmin)

// ---------------------------------------------------------------------------
// Feedback global toggle
// ---------------------------------------------------------------------------

webhooksRouter.get('/feedback', (_req, res) => {
  res.json({ enabled: readFeedbackFormGlobalEnabled() })
})

webhooksRouter.patch('/feedback', (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') {
    res.status(400).json({ error: 'invalid_feedback_settings_payload' })
    return
  }
  writeFeedbackFormGlobalEnabled(req.body.enabled)
  res.json({ enabled: readFeedbackFormGlobalEnabled() })
})

// ---------------------------------------------------------------------------
// Webhook configs
// ---------------------------------------------------------------------------

webhooksRouter.get('/webhooks', (req, res) => {
  const user = req.user!
  const configs = listWebhookConfigs(user.organizationId)
  res.json({ webhooks: configs })
})

webhooksRouter.post('/webhooks', (req, res) => {
  const user = req.user!
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : ''
  const events: WebhookEvent[] = Array.isArray(req.body?.events)
    ? (req.body.events as unknown[]).filter((e): e is WebhookEvent =>
        typeof e === 'string' && (WEBHOOK_EVENTS as string[]).includes(e),
      )
    : []
  if (!url || !events.length) {
    res.status(400).json({ error: 'invalid_webhook_payload' })
    return
  }
  const input: CreateWebhookInput = {
    url,
    secret: typeof req.body?.secret === 'string' ? req.body.secret : undefined,
    events,
    isEnabled: req.body?.isEnabled !== false,
  }
  const webhook = createWebhookConfig(user.organizationId, input)
  if (!webhook) {
    res.status(400).json({ error: 'webhook_create_failed' })
    return
  }
  res.status(201).json({ webhook })
})

webhooksRouter.patch('/webhooks/:id', (req, res) => {
  const input: UpdateWebhookInput = {}
  if (typeof req.body?.url === 'string') input.url = req.body.url.trim()
  if (typeof req.body?.secret === 'string') input.secret = req.body.secret
  if (Array.isArray(req.body?.events)) {
    input.events = (req.body.events as unknown[]).filter((e): e is WebhookEvent =>
      typeof e === 'string' && (WEBHOOK_EVENTS as string[]).includes(e),
    )
  }
  if (typeof req.body?.isEnabled === 'boolean') input.isEnabled = req.body.isEnabled
  const webhook = updateWebhookConfig(String(req.params.id), input)
  if (!webhook) {
    res.status(404).json({ error: 'webhook_not_found' })
    return
  }
  res.json({ webhook })
})

webhooksRouter.delete('/webhooks/:id', (req, res) => {
  const deleted = deleteWebhookConfig(String(req.params.id))
  if (!deleted) {
    res.status(404).json({ error: 'webhook_not_found' })
    return
  }
  res.json({ success: true })
})

webhooksRouter.post('/webhooks/:id/test', (req, res) => {
  const user = req.user!
  dispatchWebhookEvent(user.organizationId, 'ticket.created', {
    test: true,
    message: 'This is a test ping from Team Support Pro.',
    triggeredBy: user.name,
  })
  res.json({ success: true })
})
