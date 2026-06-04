import { Router } from 'express'
import {
  buildCookieOptions,
  createSessionToken,
  SESSION_COOKIE_NAME,
  type SessionUser,
} from '../auth.js'
import { readSessionUserFromRequest, isAdminUser } from '../middleware.js'
import {
  createOrganization,
  createCategory,
  createTeam,
  createUser,
  deleteOrganization,
  deleteCategory,
  deleteTeam,
  deleteUser,
  getOrganizationById,
  getCategoryById,
  getTeamById,
  getUserById,
  listOrganizations,
  listCategories,
  listTeams,
  listUsers,
  loadDirectoryData,
  updateOrganization,
  updateCategory,
  updateTeam,
  updateUser,
} from '../directory.js'
import {
  getTicketFieldDefinitions,
  saveTicketFieldDefinitions,
  type TicketFieldDefinition,
} from '../ticket-designer.js'

export const directoryRouter = Router()

// ---------------------------------------------------------------------------
// Directory (full dataset for the app shell)
// ---------------------------------------------------------------------------

directoryRouter.get('/', async (req, res) => {
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

directoryRouter.get('/public', async (_req, res) => {
  try {
    const [organizations, teams, categories] = await Promise.all([listOrganizations(), listTeams(), listCategories()])
    res.json({ organizations, teams, categories })
  } catch (error) {
    console.error('Loading public directory data failed.', error)
    res.status(500).json({ error: 'public_directory_load_failed' })
  }
})

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

directoryRouter.get('/organizations', async (req, res) => {
  if (!readSessionUserFromRequest(req)) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  try {
    res.json({ organizations: await listOrganizations() })
  } catch (error) {
    console.error('Loading organizations failed.', error)
    res.status(500).json({ error: 'organization_load_failed' })
  }
})

directoryRouter.get('/organizations/:organizationId', async (req, res) => {
  if (!readSessionUserFromRequest(req)) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }

  const organization = await getOrganizationById(req.params.organizationId)
  if (!organization) {
    res.status(404).json({ error: 'organization_not_found' })
    return
  }

  res.json({ organization })
})

directoryRouter.post('/organizations', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  if (!isAdminUser(user)) {
    res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthenticated' })
    return
  }

  try {
    const organization = await createOrganization({
      id: typeof req.body?.id === 'string' ? req.body.id : undefined,
      name: typeof req.body?.name === 'string' ? req.body.name : '',
      code: typeof req.body?.code === 'string' ? req.body.code : '',
      accent: typeof req.body?.accent === 'string' ? req.body.accent : '',
    })

    if (!organization) {
      res.status(400).json({ error: 'organization_create_failed' })
      return
    }

    res.status(201).json({ organization })
  } catch (error) {
    console.error('Creating organization failed.', error)
    res.status(500).json({ error: 'organization_create_failed' })
  }
})

directoryRouter.patch('/organizations/:organizationId', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  if (!isAdminUser(user)) {
    res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthenticated' })
    return
  }

  try {
    const organization = await updateOrganization(req.params.organizationId, {
      name: typeof req.body?.name === 'string' ? req.body.name : '',
      code: typeof req.body?.code === 'string' ? req.body.code : '',
      accent: typeof req.body?.accent === 'string' ? req.body.accent : '',
    })

    if (!organization) {
      res.status(400).json({ error: 'organization_update_failed' })
      return
    }

    res.json({ organization })
  } catch (error) {
    console.error('Updating organization failed.', error)
    res.status(500).json({ error: 'organization_update_failed' })
  }
})

directoryRouter.delete('/organizations/:organizationId', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  if (!isAdminUser(user)) {
    res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthenticated' })
    return
  }

  try {
    const deleted = await deleteOrganization(req.params.organizationId)
    if (!deleted) {
      res.status(400).json({ error: 'organization_delete_failed' })
      return
    }
    res.status(204).end()
  } catch (error) {
    console.error('Deleting organization failed.', error)
    res.status(500).json({ error: 'organization_delete_failed' })
  }
})

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

directoryRouter.get('/teams', async (req, res) => {
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

directoryRouter.get('/teams/:teamId', async (req, res) => {
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

directoryRouter.post('/teams', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  if (!isAdminUser(user)) {
    res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthenticated' })
    return
  }

  try {
    const team = await createTeam({
      id: typeof req.body?.id === 'string' ? req.body.id : undefined,
      organizationId: typeof req.body?.organizationId === 'string' ? req.body.organizationId : '',
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

directoryRouter.patch('/teams/:teamId', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  if (!isAdminUser(user)) {
    res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthenticated' })
    return
  }

  try {
    const team = await updateTeam(req.params.teamId, {
      organizationId: typeof req.body?.organizationId === 'string' ? req.body.organizationId : '',
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

directoryRouter.delete('/teams/:teamId', async (req, res) => {
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

// ---------------------------------------------------------------------------
// Ticket field definitions (per-team)
// ---------------------------------------------------------------------------

directoryRouter.get('/teams/:teamId/ticket-fields', (req, res) => {
  const user = readSessionUserFromRequest(req)
  if (!user) {
    res.status(401).json({ error: 'unauthenticated' })
    return
  }
  const fields = getTicketFieldDefinitions(req.params.teamId)
  res.json({ fields })
})

directoryRouter.put('/teams/:teamId/ticket-fields', (req, res) => {
  const user = readSessionUserFromRequest(req)
  if (!isAdminUser(user)) {
    res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthenticated' })
    return
  }
  if (!Array.isArray(req.body?.fields)) {
    res.status(400).json({ error: 'invalid_ticket_fields_payload' })
    return
  }
  const fields = saveTicketFieldDefinitions(req.params.teamId, req.body.fields as Array<Partial<TicketFieldDefinition>>)
  res.json({ fields })
})

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

directoryRouter.get('/categories', async (req, res) => {
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

directoryRouter.get('/categories/:categoryId', async (req, res) => {
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

directoryRouter.post('/categories', async (req, res) => {
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

directoryRouter.patch('/categories/:categoryId', async (req, res) => {
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

directoryRouter.delete('/categories/:categoryId', async (req, res) => {
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

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

directoryRouter.get('/users', async (req, res) => {
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

directoryRouter.get('/users/:userId', async (req, res) => {
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

directoryRouter.post('/users', async (req, res) => {
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
      organizationId: typeof req.body?.organizationId === 'string' ? req.body.organizationId : '',
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

directoryRouter.patch('/users/:userId', async (req, res) => {
  const user = readSessionUserFromRequest(req)
  if (!isAdminUser(user)) {
    res.status(user ? 403 : 401).json({ error: user ? 'admin_required' : 'unauthenticated' })
    return
  }

  try {
    const updatedUser = await updateUser(req.params.userId, {
      name: typeof req.body?.name === 'string' ? req.body.name : '',
      email: typeof req.body?.email === 'string' ? req.body.email : '',
      organizationId: typeof req.body?.organizationId === 'string' ? req.body.organizationId : '',
      teamId: typeof req.body?.teamId === 'string' ? req.body.teamId : '',
      role: req.body?.role === 'Admin' ? 'Admin' : 'Staff',
    })

    if (!updatedUser) {
      res.status(400).json({ error: 'user_update_failed' })
      return
    }

    // If the user updated their own account, refresh the session cookie
    if (user && user.id === updatedUser.id) {
      const [updatedTeam, updatedOrganization] = await Promise.all([
        getTeamById(updatedUser.teamId),
        getOrganizationById(updatedUser.organizationId),
      ])
      const refreshedSessionUser: SessionUser = {
        ...user,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        organizationId: updatedUser.organizationId,
        organizationName: updatedOrganization?.name ?? user.organizationName,
        organizationCode: updatedOrganization?.code ?? user.organizationCode,
        organizationAccent: updatedOrganization?.accent ?? user.organizationAccent,
        teamId: updatedUser.teamId,
        teamName: updatedTeam?.name ?? user.teamName,
        teamCode: updatedTeam?.code ?? user.teamCode,
        teamAccent: updatedTeam?.accent ?? user.teamAccent,
      }

      res.cookie(
        SESSION_COOKIE_NAME,
        createSessionToken(refreshedSessionUser),
        buildCookieOptions(7 * 24 * 60 * 60 * 1000),
      )
    }

    res.json({ user: updatedUser })
  } catch (error) {
    console.error('Updating user failed.', error)
    res.status(500).json({ error: 'user_update_failed' })
  }
})

directoryRouter.delete('/users/:userId', async (req, res) => {
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
