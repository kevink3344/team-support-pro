import { getDb, dbGet, dbRun } from './db.js'

const POWER_BI_REPORT_URL_KEY = 'powerBiReportUrl'

const UPSERT_SQL = `INSERT INTO AppSettings (Key, Value, UpdatedAt)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(Key) DO UPDATE SET Value = excluded.Value, UpdatedAt = datetime('now')`

export const readRapidIdentityEnabled = async (): Promise<boolean> => {
  const db = getDb()
  const row = await dbGet(db, "SELECT Value AS value FROM AppSettings WHERE Key = 'rapidIdentityEnabled' LIMIT 1")
  if (!row?.value) return true
  return String(row.value) === 'true'
}

export const writeRapidIdentityEnabled = async (isEnabled: boolean): Promise<void> => {
  const db = getDb()
  await dbRun(db, UPSERT_SQL, ['rapidIdentityEnabled', isEnabled ? 'true' : 'false'])
}

export const readEmailNotificationsEnabled = async (): Promise<boolean> => {
  const db = getDb()
  const row = await dbGet(db, "SELECT Value AS value FROM AppSettings WHERE Key = 'emailNotificationsEnabled' LIMIT 1")
  return String(row?.value ?? '') === 'true'
}

export const writeEmailNotificationsEnabled = async (isEnabled: boolean): Promise<void> => {
  const db = getDb()
  await dbRun(db, UPSERT_SQL, ['emailNotificationsEnabled', isEnabled ? 'true' : 'false'])
}

export const readPowerBiReportUrl = async (): Promise<string | null> => {
  const db = getDb()
  const row = await dbGet(db, 'SELECT Value AS value FROM AppSettings WHERE Key = ? LIMIT 1', [POWER_BI_REPORT_URL_KEY])
  const value = String(row?.value ?? '').trim()
  return value ? value : null
}

export const writePowerBiReportUrl = async (reportUrl: string | null): Promise<void> => {
  const db = getDb()
  await dbRun(db, UPSERT_SQL, [POWER_BI_REPORT_URL_KEY, reportUrl?.trim() ?? ''])
}

const ABOUT_PAGE_HTML_KEY = 'aboutPageHtml'

export const readAboutPageHtml = async (): Promise<string> => {
  const db = getDb()
  const row = await dbGet(db, 'SELECT Value AS value FROM AppSettings WHERE Key = ? LIMIT 1', [ABOUT_PAGE_HTML_KEY])
  return String(row?.value ?? '')
}

export const writeAboutPageHtml = async (html: string): Promise<void> => {
  const db = getDb()
  await dbRun(db, UPSERT_SQL, [ABOUT_PAGE_HTML_KEY, html])
}
