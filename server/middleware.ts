import express from 'express'
import {
  readSessionToken,
  SESSION_COOKIE_NAME,
  type SessionUser,
} from './auth.js'
import { serverConfig } from './config.js'

export const readTestApiKeyUserFromRequest = (req: express.Request): SessionUser | null => {
  if (!serverConfig.testApiKey) {
    return null
  }

  const authorizationHeader = req.header('authorization')?.trim() || ''
  const bearerToken = authorizationHeader.toLowerCase().startsWith('bearer ')
    ? authorizationHeader.slice(7).trim()
    : ''
  const apiKeyHeader = req.header('x-api-key')?.trim() || ''
  const providedKey = apiKeyHeader || bearerToken

  if (!providedKey || providedKey !== serverConfig.testApiKey) {
    return null
  }

  return {
    id: 'postman-it-staff',
    name: serverConfig.testApiUserName,
    email: serverConfig.testApiUserEmail,
    role: 'Staff',
    organizationId: serverConfig.fallbackOrganization.id,
    organizationName: serverConfig.fallbackOrganization.name,
    organizationCode: serverConfig.fallbackOrganization.code,
    organizationAccent: serverConfig.fallbackOrganization.accent,
    teamId: serverConfig.fallbackTeam.id,
    teamName: serverConfig.fallbackTeam.name,
    teamCode: serverConfig.fallbackTeam.code,
    teamAccent: serverConfig.fallbackTeam.accent,
  }
}

export const readSessionUserFromRequest = (req: express.Request): SessionUser | null => {
  const token = req.cookies[SESSION_COOKIE_NAME]
  const testApiUser = readTestApiKeyUserFromRequest(req)

  if (!token) {
    return testApiUser || null
  }

  try {
    return readSessionToken(token)
  } catch {
    return testApiUser || null
  }
}

export const isAdminUser = (user: SessionUser | null): user is SessionUser => user?.role === 'Admin'
