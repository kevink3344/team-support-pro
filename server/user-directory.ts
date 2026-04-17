import { getDb } from './db.js'
import { serverConfig } from './config.js'
import type { SessionUser } from './auth.js'

interface AuthInput {
  subject: string
  email: string
  name: string
}

export const resolveAuthenticatedUser = async (input: AuthInput): Promise<SessionUser> => {
  const db = getDb()

  const row = db.prepare(`
    SELECT u.Id AS userId, COALESCE(u.DisplayName, u.Name) AS displayName, u.Email AS email,
      COALESCE(t.Id, u.TeamId) AS teamId, COALESCE(t.Name, 'IT Support') AS teamName,
      COALESCE(t.Code, 'IT') AS teamCode, COALESCE(t.AccentColor, '#0078d4') AS teamAccent,
      COALESCE(u.Role, 'Staff') AS role
    FROM Users u
    LEFT JOIN Teams t ON t.Id = u.TeamId
    WHERE LOWER(u.Email) = LOWER(?)
  `).get(input.email.toLowerCase()) as Record<string, unknown> | undefined

  if (row) {
    return {
      id: String(row.userId),
      name: String(row.displayName),
      email: String(row.email),
      role: String(row.role) === 'Admin' ? 'Admin' : 'Staff',
      teamId: String(row.teamId),
      teamName: String(row.teamName),
      teamCode: String(row.teamCode),
      teamAccent: String(row.teamAccent),
    }
  }

  return {
    id: input.subject,
    name: input.name,
    email: input.email,
    role: serverConfig.fallbackRole as 'Admin' | 'Staff',
    teamId: serverConfig.fallbackTeam.id,
    teamName: serverConfig.fallbackTeam.name,
    teamCode: serverConfig.fallbackTeam.code,
    teamAccent: serverConfig.fallbackTeam.accent,
  }
}
