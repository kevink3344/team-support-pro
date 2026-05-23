import { getDb } from './db.js'

export interface AnonymousPageConfig {
  id: string
  name: string
  organizationId: string
  pagePath: string
  enabled: boolean
}

interface AnonymousPageConfigRecord {
  id?: string
  name?: string
  organizationId?: string
  pagePath?: string
  enabled?: boolean
}

const ANONYMOUS_PAGE_SETTINGS_KEY = 'anonymous-page-configs'

const buildFallbackConfig = (organizationId: string): AnonymousPageConfig[] => [
  {
    id: 'anon-page-default',
    name: 'Legacy Default',
    organizationId,
    pagePath: 'index.html',
    enabled: true,
  },
]

export const normalizeAnonymousPagePath = (value: string) => {
  const trimmed = value.trim().replace(/\\/g, '/')
  const fileName = trimmed.split('/').filter(Boolean).at(-1) ?? ''
  const sanitized = fileName.toLowerCase().replace(/[^a-z0-9._-]/g, '')

  if (!sanitized) {
    return 'index.html'
  }

  return sanitized.endsWith('.html') ? sanitized : `${sanitized}.html`
}

const parseAnonymousPageConfigs = (value: string | undefined): AnonymousPageConfigRecord[] => {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? (parsed as AnonymousPageConfigRecord[]) : []
  } catch {
    return []
  }
}

const normalizeAnonymousPageConfigs = (
  entries: AnonymousPageConfigRecord[],
  validOrganizationIds: Set<string>,
): AnonymousPageConfig[] => {
  const seenPagePaths = new Set<string>()
  const normalized: AnonymousPageConfig[] = []

  for (const entry of entries) {
    const organizationId = typeof entry.organizationId === 'string' ? entry.organizationId.trim() : ''
    const pagePath = normalizeAnonymousPagePath(typeof entry.pagePath === 'string' ? entry.pagePath : '')
    const name = typeof entry.name === 'string' ? entry.name.trim() : ''

    if (!organizationId || !validOrganizationIds.has(organizationId) || !name || seenPagePaths.has(pagePath)) {
      continue
    }

    seenPagePaths.add(pagePath)
    normalized.push({
      id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `anon-page-${pagePath.replace(/[^a-z0-9]+/g, '-')}`,
      name,
      organizationId,
      pagePath,
      enabled: entry.enabled !== false,
    })
  }

  return normalized
}

const readStoredAnonymousPageConfigs = () => {
  const db = getDb()
  const row = db
    .prepare('SELECT Value AS value FROM AppSettings WHERE Key = ? LIMIT 1')
    .get(ANONYMOUS_PAGE_SETTINGS_KEY) as { value?: string } | undefined

  return parseAnonymousPageConfigs(row?.value)
}

export const listAnonymousPageConfigs = (organizationIds: string[]): AnonymousPageConfig[] => {
  if (organizationIds.length === 0) {
    return []
  }

  const validOrganizationIds = new Set(organizationIds)
  const stored = normalizeAnonymousPageConfigs(readStoredAnonymousPageConfigs(), validOrganizationIds)

  if (stored.length > 0) {
    return stored
  }

  const fallbackOrgId = organizationIds.includes('legacy-default') ? 'legacy-default' : organizationIds[0]
  return buildFallbackConfig(fallbackOrgId)
}

export const writeAnonymousPageConfigs = (entries: AnonymousPageConfig[]) => {
  const db = getDb()
  db.prepare(`
    INSERT INTO AppSettings (Key, Value, UpdatedAt)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(Key) DO UPDATE SET Value = excluded.Value, UpdatedAt = datetime('now')
  `).run(ANONYMOUS_PAGE_SETTINGS_KEY, JSON.stringify(entries))
}

export const resolveAnonymousPageConfig = (
  pagePath: string,
  organizationIds: string[],
): AnonymousPageConfig | null => {
  const normalizedPagePath = normalizeAnonymousPagePath(pagePath)
  return listAnonymousPageConfigs(organizationIds).find(
    (entry) => entry.enabled && entry.pagePath === normalizedPagePath,
  ) ?? null
}