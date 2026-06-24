import { getDb } from './db.js'

const POWER_BI_REPORT_URL_KEY = 'powerBiReportUrl'

export const readRapidIdentityEnabled = () => {
  const db = getDb()
  const row = db
    .prepare("SELECT Value AS value FROM AppSettings WHERE Key = 'rapidIdentityEnabled' LIMIT 1")
    .get() as { value?: string } | undefined

  if (!row?.value) {
    return true
  }

  return row.value === 'true'
}

export const writeRapidIdentityEnabled = (isEnabled: boolean) => {
  const db = getDb()
  db.prepare(
    "INSERT INTO AppSettings (Key, Value, UpdatedAt) VALUES ('rapidIdentityEnabled', ?, datetime('now')) ON CONFLICT(Key) DO UPDATE SET Value = excluded.Value, UpdatedAt = datetime('now')",
  ).run(isEnabled ? 'true' : 'false')
}

export const readEmailNotificationsEnabled = () => {
  const db = getDb()
  const row = db
    .prepare("SELECT Value AS value FROM AppSettings WHERE Key = 'emailNotificationsEnabled' LIMIT 1")
    .get() as { value?: string } | undefined
  return row?.value === 'true'
}

export const writeEmailNotificationsEnabled = (isEnabled: boolean) => {
  const db = getDb()
  db.prepare(
    "INSERT INTO AppSettings (Key, Value, UpdatedAt) VALUES ('emailNotificationsEnabled', ?, datetime('now')) ON CONFLICT(Key) DO UPDATE SET Value = excluded.Value, UpdatedAt = datetime('now')",
  ).run(isEnabled ? 'true' : 'false')
}

export const readPowerBiReportUrl = () => {
  const db = getDb()
  const row = db
    .prepare('SELECT Value AS value FROM AppSettings WHERE Key = ? LIMIT 1')
    .get(POWER_BI_REPORT_URL_KEY) as { value?: string } | undefined

  const value = row?.value?.trim()
  return value ? value : null
}

export const writePowerBiReportUrl = (reportUrl: string | null) => {
  const db = getDb()
  db.prepare(
    "INSERT INTO AppSettings (Key, Value, UpdatedAt) VALUES (?, ?, datetime('now')) ON CONFLICT(Key) DO UPDATE SET Value = excluded.Value, UpdatedAt = datetime('now')",
  ).run(POWER_BI_REPORT_URL_KEY, reportUrl?.trim() ?? '')
}

const ABOUT_PAGE_HTML_KEY = 'aboutPageHtml'

export const readAboutPageHtml = () => {
  const db = getDb()
  const row = db
    .prepare('SELECT Value AS value FROM AppSettings WHERE Key = ? LIMIT 1')
    .get(ABOUT_PAGE_HTML_KEY) as { value?: string } | undefined
  return row?.value ?? ''
}

export const writeAboutPageHtml = (html: string) => {
  const db = getDb()
  db.prepare(
    "INSERT INTO AppSettings (Key, Value, UpdatedAt) VALUES (?, ?, datetime('now')) ON CONFLICT(Key) DO UPDATE SET Value = excluded.Value, UpdatedAt = datetime('now')",
  ).run(ABOUT_PAGE_HTML_KEY, html)
}
