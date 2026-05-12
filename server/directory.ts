import { getDb } from './db.js'

const slugify = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

export interface DirectoryOrganization {
  id: string
  name: string
  code: string
  accent: string
}

export interface DirectoryTeam {
  id: string
  organizationId: string
  name: string
  code: string
  accent: string
}

export interface DirectoryCategory {
  id: string
  teamId: string
  name: string
  description: string
}

export interface DirectoryUser {
  id: string
  name: string
  email: string
  organizationId: string
  teamId: string
  role: 'Admin' | 'Staff'
}

export interface DirectoryOrganizationInput {
  id?: string
  name: string
  code: string
  accent: string
}

export interface DirectoryTeamInput {
  id?: string
  organizationId: string
  name: string
  code: string
  accent: string
}

export interface DirectoryCategoryInput {
  id?: string
  teamId: string
  name: string
  description: string
}

export interface DirectoryUserInput {
  id?: string
  name: string
  email: string
  organizationId: string
  teamId: string
  role: 'Admin' | 'Staff'
}

const normalizeRole = (value: unknown): 'Admin' | 'Staff' =>
  String(value).toLowerCase() === 'admin' ? 'Admin' : 'Staff'

const normalizeOrganization = (record: Record<string, unknown>): DirectoryOrganization => ({
  id: String(record.id),
  name: String(record.name),
  code: String(record.code),
  accent: String(record.accent),
})

const normalizeTeam = (record: Record<string, unknown>): DirectoryTeam => ({
  id: String(record.id),
  organizationId: String(record.organizationId),
  name: String(record.name),
  code: String(record.code),
  accent: String(record.accent),
})

const normalizeCategory = (record: Record<string, unknown>): DirectoryCategory => ({
  id: String(record.id),
  teamId: String(record.teamId),
  name: String(record.name),
  description: String(record.description),
})

const normalizeUser = (record: Record<string, unknown>): DirectoryUser => ({
  id: String(record.id),
  name: String(record.name),
  email: String(record.email),
  organizationId: String(record.organizationId),
  teamId: String(record.teamId),
  role: normalizeRole(record.role),
})

const validString = (value: string) => value.trim().length > 0
const validRole = (value: string) => value === 'Admin' || value === 'Staff'
const defaultOrganizationId = (input: DirectoryOrganizationInput) => input.id?.trim() || slugify(input.name)
const defaultTeamId = (input: DirectoryTeamInput) => input.id?.trim() || `team-${slugify(input.organizationId)}-${slugify(input.name)}`
const defaultCategoryId = (input: DirectoryCategoryInput) => input.id?.trim() || `cat-${slugify(input.teamId)}-${slugify(input.name)}`
const defaultUserId = (input: DirectoryUserInput) => input.id?.trim() || `u-${slugify(input.name)}`

const organizationExists = (organizationId: string) => {
  const db = getDb()
  const row = db.prepare('SELECT 1 AS existsFlag FROM Organizations WHERE Id = ?').get(organizationId)
  return Boolean(row)
}

const teamBelongsToOrganization = (teamId: string, organizationId: string) => {
  const db = getDb()
  const row = db.prepare('SELECT 1 AS existsFlag FROM Teams WHERE Id = ? AND OrganizationId = ?').get(teamId, organizationId)
  return Boolean(row)
}

export const listOrganizations = async (): Promise<DirectoryOrganization[]> => {
  const db = getDb()
  const rows = db.prepare('SELECT Id AS id, Name AS name, Code AS code, AccentColor AS accent FROM Organizations ORDER BY Name ASC').all() as Record<string, unknown>[]
  return rows.map(normalizeOrganization)
}

export const getOrganizationById = async (organizationId: string): Promise<DirectoryOrganization | null> => {
  const db = getDb()
  const row = db.prepare('SELECT Id AS id, Name AS name, Code AS code, AccentColor AS accent FROM Organizations WHERE Id = ?').get(organizationId) as Record<string, unknown> | undefined
  return row ? normalizeOrganization(row) : null
}

export const createOrganization = async (input: DirectoryOrganizationInput): Promise<DirectoryOrganization | null> => {
  if (!validString(input.name) || !validString(input.code) || !validString(input.accent)) return null
  const organizationId = defaultOrganizationId(input)
  const db = getDb()
  db.prepare('INSERT INTO Organizations (Id, Name, Code, AccentColor) VALUES (?, ?, ?, ?)').run(organizationId, input.name.trim(), input.code.trim().toUpperCase(), input.accent.trim())
  return getOrganizationById(organizationId)
}

export const updateOrganization = async (organizationId: string, input: DirectoryOrganizationInput): Promise<DirectoryOrganization | null> => {
  if (!validString(organizationId) || !validString(input.name) || !validString(input.code) || !validString(input.accent)) return null
  const db = getDb()
  db.prepare("UPDATE Organizations SET Name = ?, Code = ?, AccentColor = ?, UpdatedAt = datetime('now') WHERE Id = ?").run(input.name.trim(), input.code.trim().toUpperCase(), input.accent.trim(), organizationId)
  return getOrganizationById(organizationId)
}

export const deleteOrganization = async (organizationId: string): Promise<boolean> => {
  if (!validString(organizationId)) return false
  const db = getDb()
  const linkedTeam = db.prepare('SELECT 1 AS linked FROM Teams WHERE OrganizationId = ? LIMIT 1').get(organizationId)
  const linkedUser = db.prepare('SELECT 1 AS linked FROM Users WHERE OrganizationId = ? LIMIT 1').get(organizationId)
  if (linkedTeam || linkedUser) return false
  const result = db.prepare('DELETE FROM Organizations WHERE Id = ?').run(organizationId)
  return result.changes > 0
}

export const listTeams = async (): Promise<DirectoryTeam[]> => {
  const db = getDb()
  const rows = db.prepare('SELECT Id AS id, OrganizationId AS organizationId, Name AS name, Code AS code, AccentColor AS accent FROM Teams ORDER BY OrganizationId ASC, Name ASC').all() as Record<string, unknown>[]
  return rows.map(normalizeTeam)
}

export const getTeamById = async (teamId: string): Promise<DirectoryTeam | null> => {
  const db = getDb()
  const row = db.prepare('SELECT Id AS id, OrganizationId AS organizationId, Name AS name, Code AS code, AccentColor AS accent FROM Teams WHERE Id = ?').get(teamId) as Record<string, unknown> | undefined
  return row ? normalizeTeam(row) : null
}

export const createTeam = async (input: DirectoryTeamInput): Promise<DirectoryTeam | null> => {
  if (!validString(input.organizationId) || !validString(input.name) || !validString(input.code) || !validString(input.accent)) return null
  if (!organizationExists(input.organizationId.trim())) return null
  const teamId = defaultTeamId(input)
  const db = getDb()
  db.prepare('INSERT INTO Teams (Id, OrganizationId, Name, Code, AccentColor) VALUES (?, ?, ?, ?, ?)').run(teamId, input.organizationId.trim(), input.name.trim(), input.code.trim().toUpperCase(), input.accent.trim())
  return getTeamById(teamId)
}

export const updateTeam = async (teamId: string, input: DirectoryTeamInput): Promise<DirectoryTeam | null> => {
  if (!validString(teamId) || !validString(input.organizationId) || !validString(input.name) || !validString(input.code) || !validString(input.accent)) return null
  if (!organizationExists(input.organizationId.trim())) return null
  const db = getDb()
  const organizationId = input.organizationId.trim()
  const tx = db.transaction(() => {
    db.prepare("UPDATE Teams SET OrganizationId = ?, Name = ?, Code = ?, AccentColor = ?, UpdatedAt = datetime('now') WHERE Id = ?").run(organizationId, input.name.trim(), input.code.trim().toUpperCase(), input.accent.trim(), teamId)
    db.prepare("UPDATE Users SET OrganizationId = ?, UpdatedAt = datetime('now') WHERE TeamId = ?").run(organizationId, teamId)
  })
  tx()
  return getTeamById(teamId)
}

export const deleteTeam = async (teamId: string): Promise<boolean> => {
  if (!validString(teamId)) return false
  const db = getDb()
  const result = db.prepare('DELETE FROM Teams WHERE Id = ?').run(teamId)
  return result.changes > 0
}

export const listCategories = async (): Promise<DirectoryCategory[]> => {
  const db = getDb()
  const rows = db.prepare('SELECT Id AS id, TeamId AS teamId, Name AS name, Description AS description FROM Categories ORDER BY TeamId ASC, Name ASC').all() as Record<string, unknown>[]
  return rows.map(normalizeCategory)
}

export const getCategoryById = async (categoryId: string): Promise<DirectoryCategory | null> => {
  const db = getDb()
  const row = db.prepare('SELECT Id AS id, TeamId AS teamId, Name AS name, Description AS description FROM Categories WHERE Id = ?').get(categoryId) as Record<string, unknown> | undefined
  return row ? normalizeCategory(row) : null
}

export const createCategory = async (input: DirectoryCategoryInput): Promise<DirectoryCategory | null> => {
  if (!validString(input.teamId) || !validString(input.name)) return null
  const categoryId = defaultCategoryId(input)
  const db = getDb()
  db.prepare('INSERT INTO Categories (Id, TeamId, Name, Description) VALUES (?, ?, ?, ?)').run(categoryId, input.teamId.trim(), input.name.trim(), input.description.trim() || 'Custom category.')
  return getCategoryById(categoryId)
}

export const updateCategory = async (categoryId: string, input: DirectoryCategoryInput): Promise<DirectoryCategory | null> => {
  if (!validString(categoryId) || !validString(input.teamId) || !validString(input.name)) return null
  const db = getDb()
  db.prepare("UPDATE Categories SET TeamId = ?, Name = ?, Description = ?, UpdatedAt = datetime('now') WHERE Id = ?").run(input.teamId.trim(), input.name.trim(), input.description.trim() || 'Custom category.', categoryId)
  return getCategoryById(categoryId)
}

export const deleteCategory = async (categoryId: string): Promise<boolean> => {
  if (!validString(categoryId)) return false
  const db = getDb()
  const result = db.prepare('DELETE FROM Categories WHERE Id = ?').run(categoryId)
  return result.changes > 0
}

export const listUsers = async (): Promise<DirectoryUser[]> => {
  const db = getDb()
  const rows = db.prepare('SELECT Id AS id, Name AS name, Email AS email, OrganizationId AS organizationId, TeamId AS teamId, Role AS role FROM Users ORDER BY Name ASC').all() as Record<string, unknown>[]
  return rows.map(normalizeUser)
}

export const getUserById = async (userId: string): Promise<DirectoryUser | null> => {
  const db = getDb()
  const row = db.prepare('SELECT Id AS id, Name AS name, Email AS email, OrganizationId AS organizationId, TeamId AS teamId, Role AS role FROM Users WHERE Id = ?').get(userId) as Record<string, unknown> | undefined
  return row ? normalizeUser(row) : null
}

export const createUser = async (input: DirectoryUserInput): Promise<DirectoryUser | null> => {
  if (!validString(input.name) || !validString(input.email) || !validString(input.organizationId) || !validString(input.teamId) || !validRole(input.role)) return null
  const organizationId = input.organizationId.trim()
  const teamId = input.teamId.trim()
  if (!organizationExists(organizationId) || !teamBelongsToOrganization(teamId, organizationId)) return null
  const userId = defaultUserId(input)
  const db = getDb()
  db.prepare('INSERT INTO Users (Id, Name, DisplayName, Email, OrganizationId, TeamId, Role) VALUES (?, ?, ?, ?, ?, ?, ?)').run(userId, input.name.trim(), input.name.trim(), input.email.trim().toLowerCase(), organizationId, teamId, input.role)
  return getUserById(userId)
}

export const updateUser = async (userId: string, input: DirectoryUserInput): Promise<DirectoryUser | null> => {
  if (!validString(userId) || !validString(input.name) || !validString(input.email) || !validString(input.organizationId) || !validString(input.teamId) || !validRole(input.role)) return null
  const organizationId = input.organizationId.trim()
  const teamId = input.teamId.trim()
  if (!organizationExists(organizationId) || !teamBelongsToOrganization(teamId, organizationId)) return null
  const db = getDb()
  db.prepare("UPDATE Users SET Name = ?, DisplayName = ?, Email = ?, OrganizationId = ?, TeamId = ?, Role = ?, UpdatedAt = datetime('now') WHERE Id = ?").run(input.name.trim(), input.name.trim(), input.email.trim().toLowerCase(), organizationId, teamId, input.role, userId)
  return getUserById(userId)
}

export const deleteUser = async (userId: string): Promise<boolean> => {
  if (!validString(userId)) return false
  const db = getDb()
  const result = db.prepare('DELETE FROM Users WHERE Id = ?').run(userId)
  return result.changes > 0
}

export const loadDirectoryData = async (): Promise<{
  organizations: DirectoryOrganization[]
  teams: DirectoryTeam[]
  categories: DirectoryCategory[]
  users: DirectoryUser[]
}> => {
  return {
    organizations: await listOrganizations(),
    teams: await listTeams(),
    categories: await listCategories(),
    users: await listUsers(),
  }
}
