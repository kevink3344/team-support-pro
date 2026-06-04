import { Router } from 'express'
import { serverConfig } from '../config.js'
import { requireAdmin } from '../middleware.js'
import {
  readRapidIdentityEnabled,
  writeRapidIdentityEnabled,
  readEmailNotificationsEnabled,
  writeEmailNotificationsEnabled,
  readPowerBiReportUrl,
  writePowerBiReportUrl,
} from '../app-settings.js'

export const settingsRouter = Router()
settingsRouter.use(requireAdmin)

// ---------------------------------------------------------------------------
// Auth settings
// ---------------------------------------------------------------------------

settingsRouter.get('/auth', (_req, res) => {
  res.json({ rapidIdentityEnabled: readRapidIdentityEnabled() })
})

settingsRouter.patch('/auth', (req, res) => {
  if (typeof req.body?.rapidIdentityEnabled !== 'boolean') {
    res.status(400).json({ error: 'invalid_auth_settings_payload' })
    return
  }
  writeRapidIdentityEnabled(req.body.rapidIdentityEnabled)
  res.json({ rapidIdentityEnabled: readRapidIdentityEnabled() })
})

// ---------------------------------------------------------------------------
// Email settings
// ---------------------------------------------------------------------------

settingsRouter.get('/email', (_req, res) => {
  const { resendApiKey, from, replyTo, gmailUser, gmailAppPassword, pollIntervalMs } = serverConfig.email
  res.json({
    enabled: readEmailNotificationsEnabled(),
    from: from || null,
    replyTo: replyTo || null,
    pollIntervalSeconds: Math.round(pollIntervalMs / 1000),
    configured: !!(resendApiKey && from),
    imapConfigured: !!(gmailUser && gmailAppPassword),
  })
})

settingsRouter.patch('/email', (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') {
    res.status(400).json({ error: 'invalid_email_settings_payload' })
    return
  }
  writeEmailNotificationsEnabled(req.body.enabled)
  res.json({ enabled: readEmailNotificationsEnabled() })
})

settingsRouter.post('/email/test-resend', async (_req, res) => {
  const { resendApiKey, from, replyTo, testTo } = serverConfig.email
  if (!resendApiKey || !from) {
    res.status(400).json({ ok: false, error: 'RESEND_API_KEY and EMAIL_FROM must be set in environment variables.' })
    return
  }
  const sendTo = testTo || replyTo
  if (!sendTo) {
    res.status(400).json({ ok: false, error: 'EMAIL_TEST_TO or EMAIL_REPLY_TO must be set to a recipient address.' })
    return
  }
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(resendApiKey)
    const { data, error } = await resend.emails.send({
      from,
      replyTo: replyTo || undefined,
      to: sendTo,
      subject: '[TKT-TEST] TeamSupportPro — Resend connectivity test',
      text: 'This is an automated connectivity test from TeamSupportPro. If you received this, Resend is configured correctly.',
    })
    if (error) {
      res.json({ ok: false, error: (error as { message?: string }).message ?? 'Resend returned an error.' })
      return
    }
    res.json({ ok: true, messageId: data?.id, sentTo: sendTo })
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : 'Unknown error sending test email.' })
  }
})

settingsRouter.post('/email/test-imap', async (_req, res) => {
  const { gmailUser, gmailAppPassword } = serverConfig.email
  if (!gmailUser || !gmailAppPassword) {
    res.status(400).json({ ok: false, error: 'GMAIL_USER and GMAIL_APP_PASSWORD must be set in environment variables.' })
    return
  }
  try {
    const { ImapFlow } = await import('imapflow')
    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user: gmailUser, pass: gmailAppPassword },
      logger: false,
    })
    try {
      await client.connect()
      const status = await client.status('INBOX', { messages: true, unseen: true })
      await client.logout()
      res.json({ ok: true, messages: status.messages, unseen: status.unseen, account: gmailUser })
    } catch (err) {
      client.close()
      const imapErr = err as { message?: string; responseText?: string; responseStatus?: string }
      const detail = imapErr.responseText ?? imapErr.message ?? 'Unknown error connecting to Gmail IMAP.'
      const status = imapErr.responseStatus ? `[${imapErr.responseStatus}] ` : ''
      res.json({ ok: false, error: `${status}${detail}` })
    }
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : 'Failed to load IMAP module.' })
  }
})

// ---------------------------------------------------------------------------
// Power BI settings
// ---------------------------------------------------------------------------

settingsRouter.get('/power-bi', (_req, res) => {
  res.json({ reportUrl: readPowerBiReportUrl() })
})

settingsRouter.patch('/power-bi', (req, res) => {
  const reportUrl = req.body?.reportUrl
  if (reportUrl !== null && reportUrl !== undefined && typeof reportUrl !== 'string') {
    res.status(400).json({ error: 'invalid_power_bi_settings_payload' })
    return
  }
  writePowerBiReportUrl(typeof reportUrl === 'string' ? reportUrl : null)
  res.json({ reportUrl: readPowerBiReportUrl() })
})
