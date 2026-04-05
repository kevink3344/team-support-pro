import sql from 'mssql'

import { serverConfig } from './config.js'

let poolPromise: Promise<sql.ConnectionPool> | null = null

export const hasDatabaseConfig = () =>
  Boolean(
    serverConfig.db.server &&
      serverConfig.db.database &&
      serverConfig.db.user &&
      serverConfig.db.password,
  )

export const getPool = async () => {
  if (!poolPromise) {
    poolPromise = sql.connect({
      server: serverConfig.db.server,
      database: serverConfig.db.database,
      user: serverConfig.db.user,
      password: serverConfig.db.password,
      port: serverConfig.db.port,
      options: {
        encrypt: true,
        trustServerCertificate: false,
      },
    })
  }

  return poolPromise
}