import crypto from 'node:crypto'

import jwt from 'jsonwebtoken'

import { serverConfig } from './config.js'

export const SESSION_COOKIE_NAME = 'team_support_session'
export const OAUTH_STATE_COOKIE_NAME = 'team_support_oauth_state'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: 'Admin' | 'Staff'
  teamId: string
  teamName: string
  teamCode: string
  teamAccent: string
  picture?: string
}

export const buildCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: serverConfig.isProduction || serverConfig.cookieSameSite === 'none',
  sameSite: serverConfig.cookieSameSite,
  path: '/',
  maxAge,
})

export const createOAuthState = () => crypto.randomBytes(24).toString('hex')

export const createSessionToken = (user: SessionUser) =>
  jwt.sign(user, serverConfig.jwtSecret, {
    expiresIn: '7d',
    issuer: 'teamsupportpro',
    audience: 'teamsupportpro-web',
  })

export const readSessionToken = (token: string) =>
  jwt.verify(token, serverConfig.jwtSecret, {
    issuer: 'teamsupportpro',
    audience: 'teamsupportpro-web',
  }) as SessionUser