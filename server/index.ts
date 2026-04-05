import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { OAuth2Client } from 'google-auth-library'
import multer from 'multer'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

import {
  buildCookieOptions,
  createOAuthState,
  createSessionToken,
  OAUTH_STATE_COOKIE_NAME,
  readSessionToken,
  SESSION_COOKIE_NAME,
  type SessionUser,
} from './auth.js'
import { serverConfig } from './config.js'
import { getDashboardSummary } from './dashboard.js'
import {
  createTicketAttachment,
  deleteTicketAttachment,
  getTicketAttachmentById,
  listTicketAttachments,
} from './attachments.js'
import {
  createCategory,
  createTeam,
  createUser,
  deleteCategory,
  deleteTeam,
  deleteUser,
  getCategoryById,
  getTeamById,
  getUserById,
  listCategories,
  listTeams,
  listUsers,
  loadDirectoryData,
  updateCategory,
  updateTeam,
  updateUser,
} from './directory.js'
import { listTeamTicketTrends } from './trends.js'
import { resolveAuthenticatedUser } from './user-directory.js'
import {
  createTicket,
  createTicketComment,
  deleteTicket,
  getTicketById,
  listTicketActivity,
  listTickets,
  ticketBelongsToTeam,
  updateTicket,
} from './tickets.js'

const app = express()
const currentFilePath = fileURLToPath(import.meta.url)
const currentDirPath = path.dirname(currentFilePath)
const clientDistPath = path.resolve(currentDirPath, '..')
const clientIndexPath = path.join(clientDistPath, 'index.html')
const hasClientBuild = fs.existsSync(clientIndexPath)
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
})
const oauthClient = new OAuth2Client({
  clientId: serverConfig.googleClientId,
  clientSecret: serverConfig.googleClientSecret || undefined,
  redirectUri: serverConfig.googleRedirectUri,
})

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || serverConfig.allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new Error('cors_not_allowed'))
    },
    credentials: true,
  }),
)
app.use(express.json())
app.use(cookieParser())

const readSessionUserFromRequest = (req: express.Request): SessionUser | null => {
  const token = req.cookies[SESSION_COOKIE_NAME]

  if (!token) {
    return null
  }

  try {
    return readSessionToken(token)
  } catch {
    return null
  }
}

const isAdminUser = (user: SessionUser | null) => user?.role === 'Admin'

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/auth/google/client', async (req, res) => {
  const credential = typeof req.body?.credential === 'string' ? req.body.credential : ''

  if (!credential) {
    res.status(400).json({ error: 'missing_credential' })
    return
  }

  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: credential,
      audience: serverConfig.googleClientId,
    })
    const payload = ticket.getPayload()

    if (!payload?.sub || !payload.email || !payload.name) {
      res.status(400).json({ error: 'invalid_google_payload' })
      return
    }

    const appUser = await resolveAuthenticatedUser({
      subject: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    })

    const sessionToken = createSessionToken(appUser)
    res.cookie(SESSION_COOKIE_NAME, sessionToken, buildCookieOptions(7 * 24 * 60 * 60 * 1000))
    res.json({
      authenticated: true,
      user: {
        subject: payload.sub,
        name: appUser.name,
        email: appUser.email,
        picture: appUser.picture,
      },
    })
  } catch (error) {
    console.error('Client Google authentication failed.', error)
    res.status(401).json({ error: 'google_auth_failed' })
  }
})

app.get('/auth/google', (_req, res) => {
  if (!serverConfig.googleClientSecret) {
    res.status(400).json({ error: 'oauth_redirect_not_configured' })
    return
  }

  const state = createOAuthState()
  const params = new URLSearchParams({
    client_id: serverConfig.googleClientId,
    redirect_uri: serverConfig.googleRedirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'select_account',
    state,
  })

  res.cookie(OAUTH_STATE_COOKIE_NAME, state, buildCookieOptions(10 * 60 * 1000))
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
})

app.get('/auth/google/callback', async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const storedState = req.cookies[OAUTH_STATE_COOKIE_NAME]

  res.clearCookie(OAUTH_STATE_COOKIE_NAME, buildCookieOptions(0))

  if (!state || !code || !storedState || state !== storedState) {
    res.redirect(`${serverConfig.clientUrl}?authError=oauth_state_invalid`)
    return
  }

  try {
    const { tokens } = await oauthClient.getToken(code)

    if (!tokens.id_token) {
      res.redirect(`${serverConfig.clientUrl}?authError=missing_id_token`)
      return
    }

    const ticket = await oauthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: serverConfig.googleClientId,
    })
    const payload = ticket.getPayload()

    if (!payload?.sub || !payload.email || !payload.name) {
      res.redirect(`${serverConfig.clientUrl}?authError=invalid_google_payload`)
      return
    }

    const appUser = await resolveAuthenticatedUser({
      subject: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
    })

    const sessionToken = createSessionToken(appUser)
    res.cookie(SESSION_COOKIE_NAME, sessionToken, buildCookieOptions(7 * 24 * 60 * 60 * 1000))
    res.redirect(serverConfig.clientUrl)
  } catch (error) {
    console.error('Google authentication failed.', error)
    res.redirect(`${serverConfig.clientUrl}?authError=google_auth_failed`)
  }
})

app.get('/api/auth/me', (req, res) => {
  const user = readSessionUserFromRequest(req)

  if (!user) {
    res.status(401).json({ authenticated: false })
    return
  }

  res.json({ authenticated: true, user })
})

app.get('/api/tickets', async (req, res) => {
  const user = readSessionUserFromRequest(req)

  if (!user) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  try {
    const tickets = await listTickets(user.teamId)
    res.json({ tickets })
  } catch (error) {
    console.error('Loading tickets failed.', error)
    res.status(500).json({ error: 'ticket_load_failed' })
  }
})

app.get('/api/directory', async (req, res) => {
  const user = readSessionUserFromRequest(req)

  if (!user) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  try {
    const directory = await loadDirectoryData()
    res.json(directory)
  } catch (error) {
    console.error('Loading directory data failed.', error)
    res.status(500).json({ error: 'directory_load_failed' })
  }
})

app.get('/api/teams', async (req, res) => {
  if (!readSessionUserFromRequest(req)) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  try {
    res.json({ teams: await listTeams() })
  } catch (error) {
    console.error('Loading teams failed.', error)
    res.status(500).json({ error: 'team_load_failed' })
  }
})

app.get('/api/teams/:teamId', async (req, res) => {
  if (!readSessionUserFromRequest(req)) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  const team = await getTeamById(req.params.teamId)
  if (!team) {
    res.status(404).json({ error: 'team_not_found' })
    return
  }

  res.json({ team })
})

app.post('/api/teams', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  if (!isAdminUser(user)) {
    res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthenticated' })
    return
  }

  try {
    const team = await createTeam({
      id: typeof req.body?.id === 'string' ? req.body.id : undefined,
      name: typeof req.body?.name === 'string' ? req.body.name : '',
      code: typeof req.body?.code === 'string' ? req.body.code : '',
      accent: typeof req.body?.accent === 'string' ? req.body.accent : '',
    })

    if (!team) {
      res.status(400).json({ error: 'team_create_failed' })
      return
    }

    res.status(201).json({ team })
  } catch (error) {
    console.error('Creating team failed.', error)
    res.status(500).json({ error: 'team_create_failed' })
  }
})

app.patch('/api/teams/:teamId', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  if (!isAdminUser(user)) {
    res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthenticated' })
    return
  }

  try {
    const team = await updateTeam(req.params.teamId, {
      name: typeof req.body?.name === 'string' ? req.body.name : '',
      code: typeof req.body?.code === 'string' ? req.body.code : '',
      accent: typeof req.body?.accent === 'string' ? req.body.accent : '',
    })

    if (!team) {
      res.status(400).json({ error: 'team_update_failed' })
      return
    }

    res.json({ team })
  } catch (error) {
    console.error('Updating team failed.', error)
    res.status(500).json({ error: 'team_update_failed' })
  }
})

app.delete('/api/teams/:teamId', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  if (!isAdminUser(user)) {
    res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthenticated' })
    return
  }

  try {
    const deleted = await deleteTeam(req.params.teamId)
    if (!deleted) {
      res.status(404).json({ error: 'team_not_found' })
      return
    }

    res.status(204).end()
  } catch (error) {
    console.error('Deleting team failed.', error)
    res.status(500).json({ error: 'team_delete_failed' })
  }
})

app.get('/api/categories', async (req, res) => {
  if (!readSessionUserFromRequest(req)) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  try {
    res.json({ categories: await listCategories() })
  } catch (error) {
    console.error('Loading categories failed.', error)
    res.status(500).json({ error: 'category_load_failed' })
  }
})

app.get('/api/categories/:categoryId', async (req, res) => {
  if (!readSessionUserFromRequest(req)) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  const category = await getCategoryById(req.params.categoryId)
  if (!category) {
    res.status(404).json({ error: 'category_not_found' })
    return
  }

  res.json({ category })
})

app.post('/api/categories', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  if (!isAdminUser(user)) {
    res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthenticated' })
    return
  }

  try {
    const category = await createCategory({
      id: typeof req.body?.id === 'string' ? req.body.id : undefined,
      teamId: typeof req.body?.teamId === 'string' ? req.body.teamId : '',
      name: typeof req.body?.name === 'string' ? req.body.name : '',
      description: typeof req.body?.description === 'string' ? req.body.description : '',
    })

    if (!category) {
      res.status(400).json({ error: 'category_create_failed' })
      return
    }

    res.status(201).json({ category })
  } catch (error) {
    console.error('Creating category failed.', error)
    res.status(500).json({ error: 'category_create_failed' })
  }
})

app.patch('/api/categories/:categoryId', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  if (!isAdminUser(user)) {
    res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthenticated' })
    return
  }

  try {
    const category = await updateCategory(req.params.categoryId, {
      teamId: typeof req.body?.teamId === 'string' ? req.body.teamId : '',
      name: typeof req.body?.name === 'string' ? req.body.name : '',
      description: typeof req.body?.description === 'string' ? req.body.description : '',
    })

    if (!category) {
      res.status(400).json({ error: 'category_update_failed' })
      return
    }

    res.json({ category })
  } catch (error) {
    console.error('Updating category failed.', error)
    res.status(500).json({ error: 'category_update_failed' })
  }
})

app.delete('/api/categories/:categoryId', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  if (!isAdminUser(user)) {
    res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthenticated' })
    return
  }

  try {
    const deleted = await deleteCategory(req.params.categoryId)
    if (!deleted) {
      res.status(404).json({ error: 'category_not_found' })
      return
    }

    res.status(204).end()
  } catch (error) {
    console.error('Deleting category failed.', error)
    res.status(500).json({ error: 'category_delete_failed' })
  }
})

app.get('/api/users', async (req, res) => {
  if (!readSessionUserFromRequest(req)) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  try {
    res.json({ users: await listUsers() })
  } catch (error) {
    console.error('Loading users failed.', error)
    res.status(500).json({ error: 'user_load_failed' })
  }
})

app.get('/api/users/:userId', async (req, res) => {
  if (!readSessionUserFromRequest(req)) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  const foundUser = await getUserById(req.params.userId)
  if (!foundUser) {
    res.status(404).json({ error: 'user_not_found' })
    return
  }

  res.json({ user: foundUser })
})

app.post('/api/users', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  if (!isAdminUser(user)) {
    res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthenticated' })
    return
  }

  try {
    const createdUser = await createUser({
      id: typeof req.body?.id === 'string' ? req.body.id : undefined,
      name: typeof req.body?.name === 'string' ? req.body.name : '',
      email: typeof req.body?.email === 'string' ? req.body.email : '',
      teamId: typeof req.body?.teamId === 'string' ? req.body.teamId : '',
      role: req.body?.role === 'Admin' ? 'Admin' : 'Staff',
    })

    if (!createdUser) {
      res.status(400).json({ error: 'user_create_failed' })
      return
    }

    res.status(201).json({ user: createdUser })
  } catch (error) {
    console.error('Creating user failed.', error)
    res.status(500).json({ error: 'user_create_failed' })
  }
})

app.patch('/api/users/:userId', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  if (!isAdminUser(user)) {
    res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthenticated' })
    return
  }

  try {
    const updatedUser = await updateUser(req.params.userId, {
      name: typeof req.body?.name === 'string' ? req.body.name : '',
      email: typeof req.body?.email === 'string' ? req.body.email : '',
      teamId: typeof req.body?.teamId === 'string' ? req.body.teamId : '',
      role: req.body?.role === 'Admin' ? 'Admin' : 'Staff',
    })

    if (!updatedUser) {
      res.status(400).json({ error: 'user_update_failed' })
      return
    }

    res.json({ user: updatedUser })
  } catch (error) {
    console.error('Updating user failed.', error)
    res.status(500).json({ error: 'user_update_failed' })
  }
})

app.delete('/api/users/:userId', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  if (!isAdminUser(user)) {
    res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthenticated' })
    return
  }

  try {
    const deleted = await deleteUser(req.params.userId)
    if (!deleted) {
      res.status(404).json({ error: 'user_not_found' })
      return
    }

    res.status(204).end()
  } catch (error) {
    console.error('Deleting user failed.', error)
    res.status(500).json({ error: 'user_delete_failed' })
  }
})

app.get('/api/dashboard/trends', async (req, res) => {
  const user = readSessionUserFromRequest(req)

  if (!user) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  try {
    const trends = await listTeamTicketTrends()
    res.json({ trends })
  } catch (error) {
    console.error('Loading dashboard trends failed.', error)
    res.status(500).json({ error: 'dashboard_trends_load_failed' })
  }
})

app.get('/api/dashboard/summary', async (req, res) => {
  const user = readSessionUserFromRequest(req)

  if (!user) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  try {
    const summary = await getDashboardSummary()
    res.json({ summary })
  } catch (error) {
    console.error('Loading dashboard summary failed.', error)
    res.status(500).json({ error: 'dashboard_summary_load_failed' })
  }
})

app.get('/api/tickets/activity', async (req, res) => {
  const user = readSessionUserFromRequest(req)

  if (!user) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  try {
    const tickets = await listTickets(user.teamId)
    const ticketIds = new Set(tickets.map((ticket) => ticket.id))
    const activity = (await listTicketActivity()).filter((entry) => ticketIds.has(entry.ticketId))
    res.json({ activity })
  } catch (error) {
    console.error('Loading ticket activity failed.', error)
    res.status(500).json({ error: 'ticket_activity_load_failed' })
  }
})

app.post('/api/tickets', async (req, res) => {
  const user = readSessionUserFromRequest(req)

  if (!user) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  const teamId = typeof req.body?.teamId === 'string' ? req.body.teamId : ''
  if (!teamId || teamId !== user.teamId) {
    res.status(403).json({ error: 'cross_team_ticket_create_forbidden' })
    return
  }

  try {
    const ticket = await createTicket(
      {
        id: typeof req.body?.id === 'string' ? req.body.id : undefined,
        title: typeof req.body?.title === 'string' ? req.body.title : '',
        description: typeof req.body?.description === 'string' ? req.body.description : '',
        priority: typeof req.body?.priority === 'string' ? req.body.priority : '',
        teamId,
        categoryId: typeof req.body?.categoryId === 'string' ? req.body.categoryId : '',
        assignedToId:
          typeof req.body?.assignedToId === 'string' && req.body.assignedToId.trim()
            ? req.body.assignedToId
            : null,
        requestorName: typeof req.body?.requestorName === 'string' ? req.body.requestorName : '',
        requestorEmail: typeof req.body?.requestorEmail === 'string' ? req.body.requestorEmail : '',
        location: typeof req.body?.location === 'string' ? req.body.location : '',
      },
      user.name,
    )

    if (!ticket) {
      res.status(400).json({ error: 'ticket_create_failed' })
      return
    }

    res.status(201).json({ ticket })
  } catch (error) {
    console.error('Creating ticket failed.', error)
    res.status(500).json({ error: 'ticket_create_failed' })
  }
})

app.get('/api/tickets/:ticketId', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  const ticketId = typeof req.params.ticketId === 'string' ? req.params.ticketId : ''

  if (!user) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  if (!ticketId || !(await ticketBelongsToTeam(ticketId, user.teamId))) {
    res.status(404).json({ error: 'ticket_not_found' })
    return
  }

  const ticket = await getTicketById(ticketId)
  if (!ticket) {
    res.status(404).json({ error: 'ticket_not_found' })
    return
  }

  res.json({ ticket })
})

app.get('/api/tickets/:ticketId/attachments', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  const ticketId = typeof req.params.ticketId === 'string' ? req.params.ticketId : ''

  if (!user) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  if (!ticketId || !(await ticketBelongsToTeam(ticketId, user.teamId))) {
    res.status(404).json({ error: 'ticket_not_found' })
    return
  }

  try {
    const attachments = await listTicketAttachments(ticketId)
    res.json({ attachments })
  } catch (error) {
    console.error('Loading attachments failed.', error)
    res.status(500).json({ error: 'attachment_load_failed' })
  }
})

app.post('/api/tickets/:ticketId/attachments', attachmentUpload.single('file'), async (req, res) => {
  const user = readSessionUserFromRequest(req)
  const ticketId = typeof req.params.ticketId === 'string' ? req.params.ticketId : ''

  if (!user) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  if (!ticketId || !(await ticketBelongsToTeam(ticketId, user.teamId))) {
    res.status(404).json({ error: 'ticket_not_found' })
    return
  }

  if (!req.file) {
    res.status(400).json({ error: 'missing_attachment_file' })
    return
  }

  try {
    const attachment = await createTicketAttachment({
      ticketId,
      fileName: req.file.originalname,
      contentType: req.file.mimetype,
      fileSizeBytes: req.file.size,
      fileContent: req.file.buffer,
      uploadedByUserId: user.id,
      uploadedByName: user.name,
    })

    if (!attachment) {
      res.status(400).json({ error: 'attachment_create_failed' })
      return
    }

    res.status(201).json({ attachment })
  } catch (error) {
    console.error('Uploading attachment failed.', error)
    res.status(500).json({ error: 'attachment_create_failed' })
  }
})

app.get('/api/tickets/:ticketId/attachments/:attachmentId', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  const ticketId = typeof req.params.ticketId === 'string' ? req.params.ticketId : ''
  const attachmentId = typeof req.params.attachmentId === 'string' ? req.params.attachmentId : ''

  if (!user) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  if (!ticketId || !attachmentId || !(await ticketBelongsToTeam(ticketId, user.teamId))) {
    res.status(404).json({ error: 'attachment_not_found' })
    return
  }

  try {
    const attachment = await getTicketAttachmentById(ticketId, attachmentId)
    if (!attachment) {
      res.status(404).json({ error: 'attachment_not_found' })
      return
    }

    res.setHeader('Content-Type', attachment.contentType)
    res.setHeader('Content-Length', String(attachment.fileSizeBytes))
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.fileName.replace(/"/g, '')}"`)
    res.send(attachment.fileContent)
  } catch (error) {
    console.error('Downloading attachment failed.', error)
    res.status(500).json({ error: 'attachment_download_failed' })
  }
})

app.delete('/api/tickets/:ticketId/attachments/:attachmentId', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  const ticketId = typeof req.params.ticketId === 'string' ? req.params.ticketId : ''
  const attachmentId = typeof req.params.attachmentId === 'string' ? req.params.attachmentId : ''

  if (!user) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  if (!ticketId || !attachmentId || !(await ticketBelongsToTeam(ticketId, user.teamId))) {
    res.status(404).json({ error: 'attachment_not_found' })
    return
  }

  try {
    const deleted = await deleteTicketAttachment(ticketId, attachmentId, user.id, user.name)
    if (!deleted) {
      res.status(404).json({ error: 'attachment_not_found' })
      return
    }

    res.status(204).end()
  } catch (error) {
    console.error('Deleting attachment failed.', error)
    res.status(500).json({ error: 'attachment_delete_failed' })
  }
})

app.post('/api/tickets/:ticketId/comments', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  const ticketId = typeof req.params.ticketId === 'string' ? req.params.ticketId : ''
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''

  if (!user) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  if (!ticketId || !message) {
    res.status(400).json({ error: 'invalid_comment_payload' })
    return
  }

  if (!(await ticketBelongsToTeam(ticketId, user.teamId))) {
    res.status(403).json({ error: 'cross_team_ticket_comment_forbidden' })
    return
  }

  try {
    const comment = await createTicketComment({ ticketId, actor: user.name, message })
    res.status(201).json({ comment })
  } catch (error) {
    console.error('Creating ticket comment failed.', error)
    res.status(500).json({ error: 'ticket_comment_create_failed' })
  }
})

app.patch('/api/tickets/:ticketId', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  const ticketId = typeof req.params.ticketId === 'string' ? req.params.ticketId : ''

  if (!user) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  if (!ticketId) {
    res.status(400).json({ error: 'invalid_ticket_id' })
    return
  }

  if (!(await ticketBelongsToTeam(ticketId, user.teamId))) {
    res.status(403).json({ error: 'cross_team_ticket_update_forbidden' })
    return
  }

  try {
    const ticket = await updateTicket(
      ticketId,
      {
        title: typeof req.body?.title === 'string' ? req.body.title : '',
        description: typeof req.body?.description === 'string' ? req.body.description : '',
        status: typeof req.body?.status === 'string' ? req.body.status : '',
        priority: typeof req.body?.priority === 'string' ? req.body.priority : '',
        categoryId: typeof req.body?.categoryId === 'string' ? req.body.categoryId : '',
        assignedToId:
          typeof req.body?.assignedToId === 'string' && req.body.assignedToId.trim()
            ? req.body.assignedToId
            : null,
      },
      user.name,
    )

    if (!ticket) {
      res.status(400).json({ error: 'ticket_update_failed' })
      return
    }

    res.json({ ticket })
  } catch (error) {
    console.error('Updating ticket failed.', error)
    res.status(500).json({ error: 'ticket_update_failed' })
  }
})

app.delete('/api/tickets/:ticketId', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  const ticketId = typeof req.params.ticketId === 'string' ? req.params.ticketId : ''

  if (!user) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  if (!ticketId) {
    res.status(400).json({ error: 'invalid_ticket_id' })
    return
  }

  if (!(await ticketBelongsToTeam(ticketId, user.teamId))) {
    res.status(403).json({ error: 'cross_team_ticket_delete_forbidden' })
    return
  }

  try {
    const deleted = await deleteTicket(ticketId)
    if (!deleted) {
      res.status(404).json({ error: 'ticket_not_found' })
      return
    }

    res.status(204).end()
  } catch (error) {
    console.error('Deleting ticket failed.', error)
    res.status(500).json({ error: 'ticket_delete_failed' })
  }
})

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, buildCookieOptions(0))
  res.status(204).end()
})

if (hasClientBuild) {
  app.use(express.static(clientDistPath))

  app.get(/^(?!\/api(?:\/|$))(?!\/auth(?:\/|$)).*/, (_req, res) => {
    res.sendFile(clientIndexPath)
  })
}

app.listen(serverConfig.serverPort, () => {
  console.log(`TeamSupportPro server listening on port ${serverConfig.serverPort}`)
})

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({
      error: error.code === 'LIMIT_FILE_SIZE' ? 'attachment_too_large' : 'attachment_upload_failed',
    })
    return
  }

  if (error instanceof Error && error.message === 'cors_not_allowed') {
    res.status(403).json({ error: 'cors_not_allowed' })
    return
  }

  next(error)
})