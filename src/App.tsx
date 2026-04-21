import { useDeferredValue, useEffect, useMemo, useRef, useState, startTransition, type CSSProperties, type FormEvent } from 'react'
import {
  AnimatePresence,
  motion,
} from 'motion/react'
import {
  Bell,
  Building2,
  ChevronDown,
  Clock3,
  Download,
  FileUp,
  Grip,
  Folder,
  Paperclip,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  SunMedium,
  Ticket,
  Trash2,
  TriangleAlert,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  Responsive,
  WidthProvider,
  type Layout,
  type LayoutItem,
  type ResponsiveLayouts,
} from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { apiUrl, appConfig } from './config'
import {
  currentUserId,
  initialCategories,
  initialTeams,
  initialTickets,
  initialUsers,
  trendData as initialTrendData,
} from './data/mockData'
import { defaultThemeConfig } from './theme'
import type {
  ActivityEntry,
  AppView,
  AuthSession,
  ListViewMode,
  ThemeConfig,
  ThemeMode,
  TicketAttachment,
  Ticket as TicketRecord,
  TicketPriority,
  TicketStatus,
  TrendPoint,
  User,
} from './types'

const STORAGE_KEYS = {
  auth: 'team-support-pro-auth',
  dashboardLayout: 'team-support-pro-dashboard-layout',
  mode: 'team-support-pro-mode',
  notificationsReadIds: 'team-support-pro-notifications-read-ids',
  notificationsSampleSeeded: 'team-support-pro-notifications-sample-seeded',
  notificationsSeenAt: 'team-support-pro-notifications-seen-at',
  settingsAccordionOrder: 'team-support-pro-settings-accordion-order',
  theme: 'team-support-pro-theme',
  sidebar: 'team-support-pro-sidebar',
} as const

const REMEMBER_LOGIN_EMAIL_COOKIE = 'team-support-pro-remember-login-email'

const readCookieValue = (name: string) => {
  if (typeof document === 'undefined') {
    return ''
  }

  const encodedName = `${name}=`
  const pair = document.cookie
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(encodedName))

  if (!pair) {
    return ''
  }

  return decodeURIComponent(pair.slice(encodedName.length))
}

const setCookieValue = (name: string, value: string, days: number) => {
  if (typeof document === 'undefined') {
    return
  }

  const maxAge = Math.max(0, Math.floor(days * 24 * 60 * 60))
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`
}

const clearCookieValue = (name: string) => {
  if (typeof document === 'undefined') {
    return
  }

  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`
}

type SettingsAccordionSection =
  | 'appearance'
  | 'authentication'
  | 'addUser'
  | 'manageUsers'
  | 'manageTeams'
  | 'categories'

type SettingsAccordionState = Record<SettingsAccordionSection, boolean>

const defaultSettingsAccordionOrder: SettingsAccordionSection[] = [
  'appearance',
  'authentication',
  'addUser',
  'manageUsers',
  'manageTeams',
  'categories',
]

const normalizeSettingsAccordionOrder = (storedOrder: string[] | null | undefined) => {
  const validSections = new Set(defaultSettingsAccordionOrder)
  const sanitized = (storedOrder ?? []).filter(
    (section): section is SettingsAccordionSection => validSections.has(section as SettingsAccordionSection),
  )

  return [
    ...sanitized,
    ...defaultSettingsAccordionOrder.filter((section) => !sanitized.includes(section)),
  ]
}

const ResponsiveDashboardGrid = WidthProvider(Responsive)
type DashboardLayouts = ResponsiveLayouts<string>

type DashboardWidgetId =
  | 'metric-total'
  | 'metric-open'
  | 'metric-progress'
  | 'metric-pending'
  | 'metric-critical'
  | 'trends'
  | 'status'
  | 'queue'
  | 'notes'

const dashboardWidgetOrder: DashboardWidgetId[] = [
  'metric-total',
  'metric-open',
  'metric-progress',
  'metric-pending',
  'metric-critical',
  'trends',
  'status',
  'queue',
  'notes',
]

const defaultDashboardLayouts: DashboardLayouts = {
  lg: [
    { i: 'metric-total', x: 0, y: 0, w: 2, h: 2, minW: 2, minH: 2, static: false },
    { i: 'metric-open', x: 2, y: 0, w: 2, h: 2, minW: 2, minH: 2, static: false },
    { i: 'metric-progress', x: 4, y: 0, w: 2, h: 2, minW: 2, minH: 2, static: false },
    { i: 'metric-pending', x: 6, y: 0, w: 2, h: 2, minW: 2, minH: 2, static: false },
    { i: 'metric-critical', x: 8, y: 0, w: 2, h: 2, minW: 2, minH: 2, static: false },
    { i: 'trends', x: 0, y: 2, w: 6, h: 7, minW: 4, minH: 5, static: false },
    { i: 'status', x: 6, y: 2, w: 4, h: 7, minW: 3, minH: 5, static: false },
    { i: 'queue', x: 0, y: 9, w: 6, h: 9, minW: 4, minH: 6, static: false },
    { i: 'notes', x: 6, y: 9, w: 4, h: 9, minW: 3, minH: 5, static: false },
  ],
  md: [
    { i: 'metric-total', x: 0, y: 0, w: 2, h: 2, minW: 2, minH: 2, static: false },
    { i: 'metric-open', x: 2, y: 0, w: 2, h: 2, minW: 2, minH: 2, static: false },
    { i: 'metric-progress', x: 4, y: 0, w: 2, h: 2, minW: 2, minH: 2, static: false },
    { i: 'metric-pending', x: 6, y: 0, w: 2, h: 2, minW: 2, minH: 2, static: false },
    { i: 'metric-critical', x: 8, y: 0, w: 2, h: 2, minW: 2, minH: 2, static: false },
    { i: 'trends', x: 0, y: 2, w: 6, h: 7, minW: 4, minH: 5, static: false },
    { i: 'status', x: 6, y: 2, w: 4, h: 7, minW: 3, minH: 5, static: false },
    { i: 'queue', x: 0, y: 9, w: 6, h: 9, minW: 4, minH: 6, static: false },
    { i: 'notes', x: 6, y: 9, w: 4, h: 9, minW: 3, minH: 5, static: false },
  ],
  sm: [
    { i: 'metric-total', x: 0, y: 0, w: 1, h: 2, minW: 1, minH: 2, static: false },
    { i: 'metric-open', x: 1, y: 0, w: 1, h: 2, minW: 1, minH: 2, static: false },
    { i: 'metric-progress', x: 2, y: 0, w: 1, h: 2, minW: 1, minH: 2, static: false },
    { i: 'metric-pending', x: 3, y: 0, w: 1, h: 2, minW: 1, minH: 2, static: false },
    { i: 'metric-critical', x: 4, y: 0, w: 1, h: 2, minW: 1, minH: 2, static: false },
    { i: 'trends', x: 0, y: 2, w: 5, h: 7, minW: 3, minH: 5, static: false },
    { i: 'status', x: 0, y: 9, w: 5, h: 5, minW: 3, minH: 5, static: false },
    { i: 'queue', x: 0, y: 14, w: 5, h: 8, minW: 3, minH: 6, static: false },
    { i: 'notes', x: 0, y: 22, w: 5, h: 6, minW: 3, minH: 5, static: false },
  ],
  xs: [
    { i: 'metric-total', x: 0, y: 0, w: 1, h: 2, minW: 1, minH: 2, static: false },
    { i: 'metric-open', x: 0, y: 2, w: 1, h: 2, minW: 1, minH: 2, static: false },
    { i: 'metric-progress', x: 0, y: 4, w: 1, h: 2, minW: 1, minH: 2, static: false },
    { i: 'metric-pending', x: 0, y: 6, w: 1, h: 2, minW: 1, minH: 2, static: false },
    { i: 'metric-critical', x: 0, y: 8, w: 1, h: 2, minW: 1, minH: 2, static: false },
    { i: 'trends', x: 0, y: 10, w: 1, h: 7, minW: 1, minH: 5, static: false },
    { i: 'status', x: 0, y: 17, w: 1, h: 5, minW: 1, minH: 5, static: false },
    { i: 'queue', x: 0, y: 22, w: 1, h: 8, minW: 1, minH: 6, static: false },
    { i: 'notes', x: 0, y: 30, w: 1, h: 6, minW: 1, minH: 5, static: false },
  ],
}

const legacyMediumDashboardLayout = [
  { i: 'metric-total', x: 0, y: 0, w: 2, h: 2 },
  { i: 'metric-open', x: 2, y: 0, w: 2, h: 2 },
  { i: 'metric-progress', x: 4, y: 0, w: 2, h: 2 },
  { i: 'metric-pending', x: 0, y: 2, w: 3, h: 2 },
  { i: 'metric-critical', x: 3, y: 2, w: 3, h: 2 },
  { i: 'trends', x: 0, y: 4, w: 6, h: 7 },
  { i: 'status', x: 0, y: 11, w: 6, h: 5 },
  { i: 'queue', x: 0, y: 16, w: 6, h: 9 },
  { i: 'notes', x: 0, y: 25, w: 6, h: 7 },
] as const

const legacySmallDashboardLayout = [
  { i: 'metric-total', x: 0, y: 0, w: 1, h: 2 },
  { i: 'metric-open', x: 1, y: 0, w: 1, h: 2 },
  { i: 'metric-progress', x: 0, y: 2, w: 1, h: 2 },
  { i: 'metric-pending', x: 1, y: 2, w: 1, h: 2 },
  { i: 'metric-critical', x: 0, y: 4, w: 2, h: 2 },
  { i: 'trends', x: 0, y: 6, w: 2, h: 7 },
  { i: 'status', x: 0, y: 13, w: 2, h: 5 },
  { i: 'queue', x: 0, y: 18, w: 2, h: 8 },
  { i: 'notes', x: 0, y: 26, w: 2, h: 6 },
] as const

const matchesLegacyMediumDashboardLayout = (layout: readonly LayoutItem[]) =>
  legacyMediumDashboardLayout.every((legacyItem) => {
    const candidate = layout.find((layoutItem) => layoutItem.i === legacyItem.i)

    return (
      candidate?.x === legacyItem.x &&
      candidate?.y === legacyItem.y &&
      candidate?.w === legacyItem.w &&
      candidate?.h === legacyItem.h
    )
  }) && layout.length === dashboardWidgetOrder.length

const matchesLegacySmallDashboardLayout = (layout: readonly LayoutItem[]) =>
  legacySmallDashboardLayout.every((legacyItem) => {
    const candidate = layout.find((layoutItem) => layoutItem.i === legacyItem.i)

    return (
      candidate?.x === legacyItem.x &&
      candidate?.y === legacyItem.y &&
      candidate?.w === legacyItem.w &&
      candidate?.h === legacyItem.h
    )
  }) && layout.length === dashboardWidgetOrder.length

const mergeDashboardLayouts = (storedLayouts: DashboardLayouts | null) => {
  const breakpoints = Object.keys(defaultDashboardLayouts) as Array<keyof DashboardLayouts>

  return breakpoints.reduce<DashboardLayouts>((merged, breakpoint) => {
    const defaultLayout = defaultDashboardLayouts[breakpoint] ?? []
    const storedLayout = storedLayouts?.[breakpoint] ?? []
    const normalizedStoredLayout =
      (breakpoint === 'md' && matchesLegacyMediumDashboardLayout(storedLayout)) ||
      (breakpoint === 'sm' && matchesLegacySmallDashboardLayout(storedLayout))
        ? []
        : storedLayout
    const storedById = new Map<string, LayoutItem>(
      normalizedStoredLayout.map((layoutItem): [string, LayoutItem] => [layoutItem.i, layoutItem]),
    )

    merged[breakpoint] = defaultLayout.map((defaultItem): LayoutItem => ({
      ...defaultItem,
      ...(storedById.get(defaultItem.i) ?? {}),
      i: defaultItem.i,
      w: Math.max(storedById.get(defaultItem.i)?.w ?? defaultItem.w, defaultItem.minW ?? 1),
      h: Math.max(storedById.get(defaultItem.i)?.h ?? defaultItem.h, defaultItem.minH ?? 1),
      minW: defaultItem.minW,
      minH: defaultItem.minH,
      static: false,
    }))

    return merged
  }, {})
}

const statusOptions: TicketStatus[] = [
  'Open',
  'In Progress',
  'Pending',
  'Resolved',
  'Closed',
]

const priorityOptions: TicketPriority[] = ['Low', 'Medium', 'High', 'Critical']

const navItems: Array<{
  id: AppView
  label: string
  icon: LucideIcon
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'unassigned', label: 'Unassigned', icon: Inbox },
  { id: 'my-tickets', label: 'My Tickets', icon: Folder },
  { id: 'team-tickets', label: 'Team Tickets', icon: Users },
  { id: 'new-ticket', label: 'New Ticket', icon: Plus },
]

const adminNavItem = { id: 'settings' as AppView, label: 'Settings', icon: Settings2 }

const teamIcons: Record<string, LucideIcon> = {
  it: Wrench,
  facilities: Building2,
  learning: GraduationCap,
  security: Shield,
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const readStoredValue = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') {
    return fallback
  }

  const stored = window.localStorage.getItem(key)
  if (!stored) {
    return fallback
  }

  try {
    return JSON.parse(stored) as T
  } catch {
    return fallback
  }
}

const isThemeConfig = (value: unknown): value is ThemeConfig => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<Record<ThemeMode, Partial<ThemeConfig[ThemeMode]>>>
  return Boolean(candidate.light?.accent && candidate.dark?.accent)
}

const formatDateTime = (value: string) => dateFormatter.format(new Date(value))

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const createMockSessionUser = (session: AuthSession): User => ({
  id: session.id ?? session.subject,
  name: session.name,
  email: session.email,
  teamId: session.teamId ?? 'it',
  role: session.role ?? 'Staff',
})

interface SessionApiUser {
  id?: string
  subject?: string
  email: string
  name: string
  role?: 'Admin' | 'Staff'
  teamId?: string
  picture?: string
}

interface TicketActivityApiRecord extends ActivityEntry {
  ticketId: string
}

interface DashboardSummary {
  stats: {
    total: number
    open: number
    inProgress: number
    pending: number
    critical: number
  }
  statusCounts: Array<{
    status: TicketStatus
    count: number
  }>
  teamWorkload: Array<{
    teamId: string
    count: number
  }>
}

const mapSessionApiUser = (user: SessionApiUser): AuthSession => ({
  id: user.id,
  subject: user.subject ?? user.id ?? user.email,
  email: user.email,
  name: user.name,
  role: user.role,
  teamId: user.teamId,
  picture: user.picture,
})

const mergePersistedActivity = (
  currentTickets: TicketRecord[],
  persistedActivity: TicketActivityApiRecord[],
) => {
  const activityByTicket = new Map<string, TicketActivityApiRecord[]>()

  persistedActivity.forEach((entry) => {
    const currentEntries = activityByTicket.get(entry.ticketId) ?? []
    currentEntries.push(entry)
    activityByTicket.set(entry.ticketId, currentEntries)
  })

  return currentTickets.map((ticket) => {
    const remoteEntries = activityByTicket.get(ticket.id)
    if (!remoteEntries?.length) {
      return ticket
    }

    const mergedActivity = [...ticket.activity]
    const existingIds = new Set(mergedActivity.map((entry) => entry.id))

    remoteEntries.forEach((entry) => {
      if (!existingIds.has(entry.id)) {
        mergedActivity.push({
          id: entry.id,
          actor: entry.actor,
          message: entry.message,
          at: entry.at,
        })
      }
    })

    const updatedAt = mergedActivity.reduce((latest, entry) => {
      return new Date(entry.at).getTime() > new Date(latest).getTime() ? entry.at : latest
    }, ticket.updatedAt)

    return {
      ...ticket,
      updatedAt,
      activity: mergedActivity,
    }
  })
}

const getStatusBadgeClass = (status: TicketStatus) => {
  switch (status) {
    case 'Open':
      return 'badge badge-blue'
    case 'In Progress':
      return 'badge badge-amber'
    case 'Pending':
      return 'badge badge-orange'
    case 'Resolved':
      return 'badge badge-green'
    case 'Closed':
      return 'badge badge-slate'
    default:
      return 'badge'
  }
}

interface NotificationItem {
  id: string
  ticketId: string
  ticketTitle: string
  actor: string
  message: string
  at: string
  seeded?: boolean
}

const buildSeedNotificationItems = (
  sourceTickets: TicketRecord[],
  currentUserName: string,
): NotificationItem[] => {
  if (sourceTickets.length === 0) {
    return []
  }

  const baseTime = new Date('2026-04-05T09:00:00.000Z').getTime()
  const sampleDefinitions = [
    { actor: 'Avery Chen', message: 'escalated this ticket for same-day follow-up.', hoursAgo: 1 },
    { actor: 'Morgan Patel', message: 'requested an update before the leadership review.', hoursAgo: 2 },
    { actor: 'Jordan Brooks', message: 'added a dependency note for vendor coordination.', hoursAgo: 4 },
    { actor: 'Taylor Nguyen', message: 'confirmed the workaround with the requestor.', hoursAgo: 6 },
    { actor: 'Reese Kim', message: 'marked the ticket ready for your verification.', hoursAgo: 9 },
    { actor: 'Parker Diaz', message: 'attached the deployment checklist.', hoursAgo: 13 },
    { actor: 'Cameron Lee', message: 'captured the root-cause summary.', hoursAgo: 19 },
    { actor: 'Quinn Rivera', message: 'closed the investigation sub-task.', hoursAgo: 27 },
  ]

  return sampleDefinitions.map((definition, index) => {
    const ticket = sourceTickets[index % sourceTickets.length]

    return {
      id: `sample-notification-${ticket.id}-${index + 1}`,
      ticketId: ticket.id,
      ticketTitle: ticket.title,
      actor: definition.actor === currentUserName ? 'System Queue' : definition.actor,
      message: definition.message,
      at: new Date(baseTime - definition.hoursAgo * 60 * 60 * 1000).toISOString(),
      seeded: true,
    }
  })
}

const getPriorityBadgeClass = (priority: TicketPriority) => {
  switch (priority) {
    case 'Critical':
      return 'badge badge-red'
    case 'High':
      return 'badge badge-orange'
    case 'Medium':
      return 'badge badge-amber'
    case 'Low':
      return 'badge badge-slate'
    default:
      return 'badge'
  }
}

function App() {
  const [teams, setTeams] = useState(initialTeams)
  const [categories, setCategories] = useState(initialCategories)
  const [users, setUsers] = useState(initialUsers)
  const [tickets, setTickets] = useState(initialTickets)
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>(initialTrendData)
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null)
  const [authSession, setAuthSession] = useState<AuthSession | null>(null)
  const dashboardLayoutStorageKey = authSession
    ? `${STORAGE_KEYS.dashboardLayout}:${authSession.email.toLowerCase()}`
    : STORAGE_KEYS.dashboardLayout
  const [dashboardLayouts, setDashboardLayouts] = useState<DashboardLayouts>(() =>
    mergeDashboardLayouts(readStoredValue<DashboardLayouts | null>(dashboardLayoutStorageKey, null)),
  )
  const [activeView, setActiveView] = useState<AppView>('dashboard')
  const settingsAccordionOrderStorageKey = authSession
    ? `${STORAGE_KEYS.settingsAccordionOrder}:${authSession.email.toLowerCase()}`
    : STORAGE_KEYS.settingsAccordionOrder
  const notificationReadIdsStorageKey = authSession
    ? `${STORAGE_KEYS.notificationsReadIds}:${authSession.email.toLowerCase()}`
    : STORAGE_KEYS.notificationsReadIds
  const notificationSampleSeedStorageKey = authSession
    ? `${STORAGE_KEYS.notificationsSampleSeeded}:${authSession.email.toLowerCase()}`
    : STORAGE_KEYS.notificationsSampleSeeded
  const notificationSeenStorageKey = authSession
    ? `${STORAGE_KEYS.notificationsSeenAt}:${authSession.email.toLowerCase()}`
    : STORAGE_KEYS.notificationsSeenAt
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(() =>
    readStoredValue<string[]>(notificationReadIdsStorageKey, []),
  )
  const [listMode, setListMode] = useState<ListViewMode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'cards' : 'table',
  )
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    readStoredValue(STORAGE_KEYS.sidebar, false),
  )
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  )
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    readStoredValue(STORAGE_KEYS.mode, 'light'),
  )
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>(() => {
    const stored = readStoredValue<unknown>(STORAGE_KEYS.theme, defaultThemeConfig)
    return isThemeConfig(stored) ? stored : defaultThemeConfig
  })
  const [searchText, setSearchText] = useState('')
  const [detailTicketId, setDetailTicketId] = useState<string | null>(null)
  const [detailWidth, setDetailWidth] = useState(50)
  const [detailResizeActive, setDetailResizeActive] = useState(false)
  const [detailPinned, setDetailPinned] = useState(false)
  const [detailTab, setDetailTab] = useState<'details' | 'activity' | 'attachments'>('details')
  const [commentDraft, setCommentDraft] = useState('')
  const [commentError, setCommentError] = useState('')
  const [detailSaveError, setDetailSaveError] = useState('')
  const [attachments, setAttachments] = useState<TicketAttachment[]>([])
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentsLoading, setAttachmentsLoading] = useState(false)
  const [attachmentsError, setAttachmentsError] = useState('')
  const [attachmentUploadPending, setAttachmentUploadPending] = useState(false)
  const [attachmentDeletePendingId, setAttachmentDeletePendingId] = useState<string | null>(null)
  const [rapidIdentityEnabled, setRapidIdentityEnabled] = useState(true)
  const [authSettingsPending, setAuthSettingsPending] = useState(false)
  const [authSettingsError, setAuthSettingsError] = useState('')
  const [settingsMode, setSettingsMode] = useState<ThemeMode>('light')
  const [settingsAccordions, setSettingsAccordions] = useState<SettingsAccordionState>({
    appearance: false,
    authentication: false,
    addUser: false,
    manageUsers: false,
    manageTeams: false,
    categories: false,
  })
  const [settingsAccordionOrder, setSettingsAccordionOrder] = useState<SettingsAccordionSection[]>(() =>
    normalizeSettingsAccordionOrder(
      readStoredValue<SettingsAccordionSection[]>(
        settingsAccordionOrderStorageKey,
        defaultSettingsAccordionOrder,
      ),
    ),
  )
  const [draggedSettingsSection, setDraggedSettingsSection] = useState<SettingsAccordionSection | null>(null)
  const [settingsDragOverSection, setSettingsDragOverSection] = useState<SettingsAccordionSection | null>(null)
  const [teamForm, setTeamForm] = useState({
    name: '',
    code: '',
    accent: '#0078d4',
  })
  const [categoryForm, setCategoryForm] = useState({
    teamId: 'it',
    name: '',
    description: '',
  })
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    teamId: 'it',
    role: 'Staff' as User['role'],
  })
  const [userFormPending, setUserFormPending] = useState(false)
  const [userSavePendingIds, setUserSavePendingIds] = useState<string[]>([])
  const [userDirectoryError, setUserDirectoryError] = useState('')
  const [userDirectoryNotice, setUserDirectoryNotice] = useState('')
  const [changePasswordModal, setChangePasswordModal] = useState<{ userId: string; userName: string } | null>(null)
  const [changePasswordValue, setChangePasswordValue] = useState('')
  const [changePasswordPending, setChangePasswordPending] = useState(false)
  const [changePasswordError, setChangePasswordError] = useState('')
  const [newTicketForm, setNewTicketForm] = useState({
    title: '',
    requestorName: '',
    requestorEmail: '',
    location: '',
    categoryId: '',
    assignedToId: '',
    priority: 'Medium' as TicketPriority,
    description: '',
  })
  const [detailDraft, setDetailDraft] = useState<{
    title: string
    description: string
    status: TicketStatus
    priority: TicketPriority
    categoryId: string
    assignedToId: string
  } | null>(null)
  const [authError, setAuthError] = useState('')
  const [localAuthError, setLocalAuthError] = useState('')
  const [localAuthNotice, setLocalAuthNotice] = useState('')
  const [localRegisterName, setLocalRegisterName] = useState('')
  const [localRegisterEmail, setLocalRegisterEmail] = useState('')
  const [localRegisterPassword, setLocalRegisterPassword] = useState('')
  const [localLoginEmail, setLocalLoginEmail] = useState(() => readCookieValue(REMEMBER_LOGIN_EMAIL_COOKIE))
  const [localLoginPassword, setLocalLoginPassword] = useState('')
  const [rememberMeNextLogin, setRememberMeNextLogin] = useState(
    () => Boolean(readCookieValue(REMEMBER_LOGIN_EMAIL_COOKIE)),
  )
  const [localRegisterPending, setLocalRegisterPending] = useState(false)
  const [localLoginPending, setLocalLoginPending] = useState(false)
  const [authReady, setAuthReady] = useState(true)
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null)
  const [commentPending, setCommentPending] = useState(false)
  const [detailSavePending, setDetailSavePending] = useState(false)
  const [createTicketError, setCreateTicketError] = useState('')
  const [createTicketPending, setCreateTicketPending] = useState(false)
  const [quickActionPendingTicketId, setQuickActionPendingTicketId] = useState<string | null>(null)
  const [quickActionError, setQuickActionError] = useState('')
  const [notificationsPreviewOpen, setNotificationsPreviewOpen] = useState(false)
  const notificationsPreviewRef = useRef<HTMLDivElement | null>(null)
  const detailResizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const deferredSearch = useDeferredValue(searchText)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const availableTeams = teams.length > 0 ? teams : initialTeams
  const availableCategories = categories.length > 0 ? categories : initialCategories
  const availableUsers = users.length > 0 ? users : initialUsers
  const currentUser = authSession
    ? availableUsers.find((user) => user.email.toLowerCase() === authSession.email.toLowerCase()) ??
      createMockSessionUser(authSession)
    : availableUsers.find((user) => user.id === currentUserId) ?? availableUsers[0]
  const visibleNavItems =
    currentUser.role === 'Admin' ? [...navItems, adminNavItem] : navItems
  const currentTeam = availableTeams.find((team) => team.id === currentUser.teamId) ?? availableTeams[0]
  const currentTeamCategories = availableCategories.filter(
    (category) => category.teamId === currentUser.teamId,
  )
  const currentTeamMembers = availableUsers.some((user) => user.id === currentUser.id)
    ? availableUsers.filter((user) => user.teamId === currentUser.teamId)
    : [...availableUsers.filter((user) => user.teamId === currentUser.teamId), currentUser]

  const getTeamById = (teamId: string) => teams.find((team) => team.id === teamId)
  const getCategoryById = (categoryId: string) =>
    categories.find((category) => category.id === categoryId)
  const getUserById = (userId: string | null) =>
    users.find((user) => user.id === userId)

  const notificationSourceTickets = useMemo(
    () =>
      tickets.filter(
        (ticket) => ticket.teamId === currentUser.teamId && ticket.assignedToId === currentUser.id,
      ),
    [tickets, currentUser.teamId, currentUser.id],
  )
  const unassignedCount = useMemo(
    () =>
      tickets.filter(
        (ticket) => ticket.teamId === currentUser.teamId && (!ticket.assignedToId || !getUserById(ticket.assignedToId)),
      ).length,
    [tickets, currentUser.teamId, availableUsers],
  )
  const activePalette = isThemeConfig(themeConfig)
    ? themeConfig[themeMode]
    : defaultThemeConfig[themeMode]
  const seededNotificationItems = useMemo(
    () =>
      buildSeedNotificationItems(
        notificationSourceTickets,
        currentUser.name,
      ),
    [notificationSourceTickets, currentUser.name],
  )
  const seededReadNotificationIds = useMemo(
    () => seededNotificationItems.slice(3).map((item) => item.id),
    [seededNotificationItems],
  )

  useEffect(() => {
    if (authSession) {
      window.localStorage.setItem(STORAGE_KEYS.auth, JSON.stringify(authSession))
      return
    }

    window.localStorage.removeItem(STORAGE_KEYS.auth)
  }, [authSession])

  useEffect(() => {
    setDashboardLayouts(
      mergeDashboardLayouts(readStoredValue<DashboardLayouts | null>(dashboardLayoutStorageKey, null)),
    )
  }, [dashboardLayoutStorageKey])

  useEffect(() => {
    setSettingsAccordionOrder(
      normalizeSettingsAccordionOrder(
        readStoredValue<SettingsAccordionSection[]>(
          settingsAccordionOrderStorageKey,
          defaultSettingsAccordionOrder,
        ),
      ),
    )
  }, [settingsAccordionOrderStorageKey])

  useEffect(() => {
    const storedReadIds = readStoredValue<string[]>(notificationReadIdsStorageKey, [])
    if (storedReadIds.length > 0) {
      setReadNotificationIds(storedReadIds)
      return
    }

    const seenAt = readStoredValue<number>(notificationSeenStorageKey, 0)
    if (!seenAt) {
      setReadNotificationIds([])
      return
    }

    const migratedReadIds = tickets
      .filter(
        (ticket) => ticket.teamId === currentUser.teamId && ticket.assignedToId === currentUser.id,
      )
      .flatMap((ticket) => ticket.activity)
      .filter((entry) => new Date(entry.at).getTime() <= seenAt)
      .map((entry) => entry.id)

    setReadNotificationIds(migratedReadIds)
  }, [notificationReadIdsStorageKey, notificationSeenStorageKey, tickets, currentUser.teamId, currentUser.id])

  useEffect(() => {
    const hasSeededSamples = readStoredValue<boolean>(notificationSampleSeedStorageKey, false)
    if (hasSeededSamples || seededReadNotificationIds.length === 0) {
      return
    }

    setReadNotificationIds((current) => Array.from(new Set([...current, ...seededReadNotificationIds])))
    window.localStorage.setItem(notificationSampleSeedStorageKey, JSON.stringify(true))
  }, [notificationSampleSeedStorageKey, seededReadNotificationIds])

  useEffect(() => {
    window.localStorage.setItem(dashboardLayoutStorageKey, JSON.stringify(dashboardLayouts))
  }, [dashboardLayoutStorageKey, dashboardLayouts])

  useEffect(() => {
    window.localStorage.setItem(
      settingsAccordionOrderStorageKey,
      JSON.stringify(settingsAccordionOrder),
    )
  }, [settingsAccordionOrderStorageKey, settingsAccordionOrder])

  useEffect(() => {
    window.localStorage.setItem(notificationReadIdsStorageKey, JSON.stringify(readNotificationIds))
  }, [notificationReadIdsStorageKey, readNotificationIds])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.sidebar, JSON.stringify(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.mode, JSON.stringify(themeMode))
  }, [themeMode])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.theme, JSON.stringify(themeConfig))
  }, [themeConfig])

  useEffect(() => {
    let cancelled = false

    const loadPublicAuthSettings = async () => {
      try {
        const response = await fetch(apiUrl('/api/public/auth-settings'))
        if (!response.ok) {
          return
        }

        const payload = (await response.json()) as {
          rapidIdentityEnabled?: boolean
        }

        if (!cancelled && typeof payload.rapidIdentityEnabled === 'boolean') {
          setRapidIdentityEnabled(payload.rapidIdentityEnabled)
        }
      } catch {
        // Keep default visibility if auth settings cannot be loaded.
      }
    }

    void loadPublicAuthSettings()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const syncMobileDefaults = () => {
      const isMobile = window.innerWidth < 768
      setIsMobileViewport(isMobile)

      if (isMobile) {
        setListMode('cards')
        setSidebarCollapsed(false)
      }
    }

    syncMobileDefaults()
    window.addEventListener('resize', syncMobileDefaults)
    return () => window.removeEventListener('resize', syncMobileDefaults)
  }, [])

  useEffect(() => {
    if (currentTeamCategories.length === 0) {
      return
    }

    setNewTicketForm((current) =>
      current.categoryId
        ? current
        : { ...current, categoryId: currentTeamCategories[0].id },
    )
  }, [currentTeamCategories])

  useEffect(() => {
    let cancelled = false

    const checkBackend = async () => {
      try {
        const response = await fetch(apiUrl('/api/health'))
        if (!cancelled) {
          setBackendAvailable(response.ok)
        }
      } catch {
        if (!cancelled) {
          setBackendAvailable(false)
        }
      }
    }

    const restoreSession = async () => {
      try {
        const response = await fetch(apiUrl('/api/auth/me'), {
          credentials: 'include',
        })

        if (response.status === 401) {
          if (!cancelled) {
            setAuthSession(null)
          }
          return
        }

        if (!response.ok) {
          return
        }

        const payload = (await response.json()) as {
          authenticated?: boolean
          user?: SessionApiUser
        }

        const restoredUser = payload.user

        if (!cancelled && payload.authenticated && restoredUser) {
          setAuthSession((current) => current ?? mapSessionApiUser(restoredUser))
        }
      } catch {
        // Local storage remains the fallback when the backend is unavailable.
      } finally {
        if (!cancelled) {
          setAuthReady(true)
        }
      }
    }

    void checkBackend()
    void restoreSession()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!authReady || !authSession) {
      return
    }

    let cancelled = false

    const loadDirectory = async () => {
      try {
        const response = await fetch(apiUrl('/api/directory'), {
          credentials: 'include',
        })

        if (response.status === 401) {
          if (!cancelled) {
            setAuthSession(null)
          }
          return
        }

        if (!response.ok) {
          return
        }

        const payload = (await response.json()) as {
          teams?: typeof initialTeams
          categories?: typeof initialCategories
          users?: typeof initialUsers
        }

        if (!cancelled) {
          if (Array.isArray(payload.teams)) {
            setTeams(payload.teams)
          }

          if (Array.isArray(payload.categories)) {
            setCategories(payload.categories)
          }

          if (Array.isArray(payload.users)) {
            setUsers(payload.users)
          }
        }
      } catch {
        // The app can continue from mock directory data if the API is unavailable.
      }
    }

    const loadTickets = async () => {
      try {
        const response = await fetch(apiUrl('/api/tickets'), {
          credentials: 'include',
        })

        if (response.status === 401) {
          if (!cancelled) {
            setAuthSession(null)
          }
          return
        }

        if (!response.ok) {
          return
        }

        const payload = (await response.json()) as {
          tickets?: TicketRecord[]
        }

        if (!cancelled && Array.isArray(payload.tickets)) {
          setTickets(payload.tickets)
        }
      } catch {
        // The app can continue from mock tickets if the API is unavailable.
      }
    }

    const loadTrends = async () => {
      try {
        const response = await fetch(apiUrl('/api/dashboard/trends'), {
          credentials: 'include',
        })

        if (response.status === 401) {
          if (!cancelled) {
            setAuthSession(null)
          }
          return
        }

        if (!response.ok) {
          return
        }

        const payload = (await response.json()) as {
          trends?: TrendPoint[]
        }

        if (!cancelled && Array.isArray(payload.trends) && payload.trends.length > 0) {
          setTrendPoints(payload.trends)
        }
      } catch {
        // The app can continue from mock trend data if the API is unavailable.
      }
    }

    const loadDashboardSummary = async () => {
      try {
        const response = await fetch(apiUrl('/api/dashboard/summary'), {
          credentials: 'include',
        })

        if (response.status === 401) {
          if (!cancelled) {
            setAuthSession(null)
          }
          return
        }

        if (!response.ok) {
          return
        }

        const payload = (await response.json()) as {
          summary?: DashboardSummary
        }

        if (!cancelled && payload.summary) {
          setDashboardSummary(payload.summary)
        }
      } catch {
        // The app can continue with client-side fallback summary values.
      }
    }

    void loadDirectory()
    void loadTickets()
    void loadTrends()
    void loadDashboardSummary()

    return () => {
      cancelled = true
    }
  }, [authReady, authSession])

  useEffect(() => {
    if (!authSession) {
      return
    }

    setUsers((current) => {
      if (current.some((user) => user.email.toLowerCase() === authSession.email.toLowerCase())) {
        return current
      }

      return [createMockSessionUser(authSession), ...current]
    })
  }, [authSession])

  useEffect(() => {
    if (currentUser.role !== 'Admin' && activeView === 'settings') {
      setActiveView('dashboard')
    }
  }, [activeView, currentUser.role])

  useEffect(() => {
    if (activeView === 'notifications') {
      setReadNotificationIds((current) => {
        const next = new Set(current)
        notificationSourceTickets
          .flatMap((ticket) => ticket.activity)
          .forEach((entry) => next.add(entry.id))
        return Array.from(next)
      })
      setNotificationsPreviewOpen(false)
    }
  }, [activeView, notificationSourceTickets])

  useEffect(() => {
    const validNotificationIds = new Set(
      [
        ...notificationSourceTickets
          .flatMap((ticket) => ticket.activity.map((entry) => entry.id)),
        ...seededNotificationItems.map((item) => item.id),
      ],
    )
    setReadNotificationIds((current) => current.filter((id) => validNotificationIds.has(id)))
  }, [notificationSourceTickets, seededNotificationItems])

  useEffect(() => {
    if (!notificationsPreviewOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!notificationsPreviewRef.current?.contains(event.target as Node)) {
        setNotificationsPreviewOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [notificationsPreviewOpen])

  useEffect(() => {
    if (!detailResizeActive) {
      return
    }

    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'

    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = detailResizeStateRef.current
      if (!resizeState) {
        return
      }

      const deltaPercent = ((resizeState.startX - event.clientX) / window.innerWidth) * 100
      const nextWidth = Math.min(80, Math.max(30, resizeState.startWidth + deltaPercent))
      setDetailWidth(nextWidth)
    }

    const handlePointerUp = () => {
      detailResizeStateRef.current = null
      setDetailResizeActive(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [detailResizeActive])

  const selectedTicket = tickets.find((ticket) => ticket.id === detailTicketId) ?? null

  useEffect(() => {
    if (!selectedTicket) {
      setDetailDraft(null)
      setCommentDraft('')
      setCommentError('')
      setDetailSaveError('')
      setAttachments([])
      setAttachmentFile(null)
      setAttachmentsError('')
      return
    }

    setDetailDraft({
      title: selectedTicket.title,
      description: selectedTicket.description,
      status: selectedTicket.status,
      priority: selectedTicket.priority,
      categoryId: selectedTicket.categoryId,
      assignedToId: selectedTicket.assignedToId ?? '',
    })
    setCommentDraft('')
    setCommentError('')
    setDetailSaveError('')
    setAttachmentFile(null)
    setAttachmentsError('')
  }, [selectedTicket])

  useEffect(() => {
    if (!selectedTicket || !authSession) {
      return
    }

    let cancelled = false

    const loadAttachments = async () => {
      setAttachmentsLoading(true)
      setAttachmentsError('')

      try {
        const response = await fetch(apiUrl(`/api/tickets/${selectedTicket.id}/attachments`), {
          credentials: 'include',
        })

        if (response.status === 401) {
          if (!cancelled) {
            setAuthSession(null)
            setAttachmentsError('Your session expired. Please sign in again.')
          }
          return
        }

        if (!response.ok) {
          if (!cancelled) {
            setAttachmentsError('Attachments could not be loaded.')
          }
          return
        }

        const payload = (await response.json()) as {
          attachments?: TicketAttachment[]
        }

        if (!cancelled) {
          setAttachments(Array.isArray(payload.attachments) ? payload.attachments : [])
        }
      } catch {
        if (!cancelled) {
          setAttachmentsError('Attachments could not be loaded. Confirm the backend server is running.')
        }
      } finally {
        if (!cancelled) {
          setAttachmentsLoading(false)
        }
      }
    }

    void loadAttachments()

    return () => {
      cancelled = true
    }
  }, [selectedTicket?.id, authSession])

  useEffect(() => {
    setCreateTicketError('')
  }, [activeView])

  const refreshTicket = async (ticketId: string) => {
    const response = await fetch(apiUrl(`/api/tickets/${ticketId}`), {
      credentials: 'include',
    })

    if (response.status === 401) {
      setAuthSession(null)
      return
    }

    if (!response.ok) {
      return
    }

    const payload = (await response.json()) as {
      ticket?: TicketRecord
    }

    if (payload.ticket) {
      setTickets((current) =>
        current.map((ticket) => (ticket.id === payload.ticket?.id ? payload.ticket : ticket)),
      )
    }
  }

  const getBaseVisibleTickets = () => {
    switch (activeView) {
      case 'unassigned':
        return tickets.filter(
          (ticket) => ticket.teamId === currentUser.teamId && (!ticket.assignedToId || !getUserById(ticket.assignedToId)),
        )
      case 'my-tickets':
        return tickets.filter(
          (ticket) =>
            ticket.teamId === currentUser.teamId &&
            ticket.assignedToId === currentUser.id,
        )
      case 'team-tickets':
        return tickets.filter((ticket) => ticket.teamId === currentUser.teamId)
      case 'dashboard':
        return tickets.filter((ticket) => ticket.teamId === currentUser.teamId)
      default:
        return tickets.filter((ticket) => ticket.teamId === currentUser.teamId)
    }
  }

  const visibleTickets = getBaseVisibleTickets().filter((ticket) => {
    const query = deferredSearch.trim().toLowerCase()
    if (!query) {
      return true
    }

    const categoryName = getCategoryById(ticket.categoryId)?.name ?? ''
    const assigneeName = getUserById(ticket.assignedToId)?.name ?? ''

    return [
      ticket.id,
      ticket.title,
      ticket.requestorName,
      ticket.requestorEmail,
      categoryName,
      assigneeName,
    ]
      .join(' ')
      .toLowerCase()
      .includes(query)
  })

  const notificationItems = [
    ...seededNotificationItems,
    ...notificationSourceTickets
      .flatMap((ticket) =>
        ticket.activity.map((entry) => ({
          id: entry.id,
          ticketId: ticket.id,
          ticketTitle: ticket.title,
          actor: entry.actor,
          message: entry.message,
          at: entry.at,
        } satisfies NotificationItem)),
      )
      .filter((item) => item.actor !== currentUser.name),
  ].sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())

  const readNotificationIdSet = new Set(readNotificationIds)
  const unreadNotifications = notificationItems.filter((item) => !readNotificationIdSet.has(item.id))
  const unreadNotificationCount = unreadNotifications.length
  const notificationPreviewItems = notificationItems.slice(0, 3)

  const fallbackDashboardStats = {
    total: tickets.length,
    open: tickets.filter((ticket) => ticket.status === 'Open').length,
    inProgress: tickets.filter((ticket) => ticket.status === 'In Progress').length,
    pending: tickets.filter((ticket) => ticket.status === 'Pending').length,
    critical: tickets.filter((ticket) => ticket.priority === 'Critical').length,
  }

  const fallbackStatusCounts = statusOptions.map((status) => ({
    status,
    count: tickets.filter((ticket) => ticket.status === status).length,
  }))

  const dashboardStats = dashboardSummary?.stats ?? fallbackDashboardStats
  const statusCounts = dashboardSummary?.statusCounts ?? fallbackStatusCounts
  const teamWorkload = dashboardSummary?.teamWorkload ?? teams.map((team) => ({
    teamId: team.id,
    count: tickets.filter((ticket) => ticket.teamId === team.id).length,
  }))

  const chartData = trendPoints.map((point) => ({
    date: point.date,
    ...Object.fromEntries(
      teams.map((team) => [team.id, point.values[team.id] ?? 0]),
    ),
  }))

  const updateThemeColor = (mode: ThemeMode, field: keyof ThemeConfig[ThemeMode], value: string) => {
    setThemeConfig((current) => ({
      ...current,
      [mode]: {
        ...current[mode],
        [field]: value,
      },
    }))
  }

  const refreshAuthSession = async () => {
    try {
      const response = await fetch(apiUrl('/api/auth/me'), {
        credentials: 'include',
      })

      if (response.status === 401) {
        setAuthSession(null)
        return
      }

      if (!response.ok) {
        return
      }

      const payload = (await response.json()) as {
        authenticated?: boolean
        user?: SessionApiUser
      }

      if (payload.authenticated && payload.user) {
        setAuthSession(mapSessionApiUser(payload.user))
      }
    } catch {
      // Leave the current session in place if the refresh check fails.
    }
  }

  const openTicket = (ticketId: string) => {
    setDetailTab('details')
    setDetailTicketId(ticketId)
  }

  const openNotificationsPage = () => {
    setActiveView('notifications')
    setNotificationsPreviewOpen(false)
  }

  const toggleNotificationReadState = (notificationId: string, shouldBeUnread: boolean) => {
    setReadNotificationIds((current) => {
      const next = new Set(current)

      if (shouldBeUnread) {
        next.delete(notificationId)
      } else {
        next.add(notificationId)
      }

      return Array.from(next)
    })
  }

  const closePanel = () => {
    if (detailPinned) {
      setDetailPinned(false)
    }
    setDetailTicketId(null)
  }

  const startDetailResize = (clientX: number) => {
    if (isMobileViewport) {
      return
    }

    detailResizeStateRef.current = {
      startX: clientX,
      startWidth: detailWidth,
    }
    setDetailResizeActive(true)
  }

  const toggleSettingsAccordion = (section: SettingsAccordionSection) => {
    setSettingsAccordions((current) => ({
      ...current,
      [section]: !current[section],
    }))
  }

  const reorderSettingsAccordions = (
    draggedSection: SettingsAccordionSection,
    targetSection: SettingsAccordionSection,
  ) => {
    if (draggedSection === targetSection) {
      return
    }

    setSettingsAccordionOrder((current) => {
      const next = [...current]
      const draggedIndex = next.indexOf(draggedSection)
      const targetIndex = next.indexOf(targetSection)

      if (draggedIndex === -1 || targetIndex === -1) {
        return current
      }

      next.splice(draggedIndex, 1)
      next.splice(targetIndex, 0, draggedSection)
      return next
    })
  }

  const startSettingsAccordionDrag = (section: SettingsAccordionSection) => {
    setDraggedSettingsSection(section)
    setSettingsDragOverSection(section)
  }

  const endSettingsAccordionDrag = () => {
    setDraggedSettingsSection(null)
    setSettingsDragOverSection(null)
  }

  const signOut = async () => {
    try {
      await fetch(apiUrl('/api/auth/logout'), {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // Clear local session even if the backend is unavailable.
    }
    setAuthSession(null)
    setAuthError('')
    setLocalAuthError('')
    setLocalAuthNotice('')
    setDetailTicketId(null)
    setActiveView('dashboard')
  }

  const handleLocalRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const name = localRegisterName.trim()
    const email = localRegisterEmail.trim().toLowerCase()
    const password = localRegisterPassword

    if (name.length < 2) {
      setLocalAuthError('Enter your full name to create an account.')
      return
    }

    if (!email || !email.includes('@')) {
      setLocalAuthError('Enter a valid work email address.')
      return
    }

    if (password.length < 8) {
      setLocalAuthError('Use at least 8 characters for your password.')
      return
    }

    setLocalRegisterPending(true)
    setLocalAuthError('')
    setLocalAuthNotice('')

    try {
      const response = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password, rememberMe: rememberMeNextLogin }),
      })

      if (response.status === 409) {
        setLocalAuthError('That email is already registered. Use SIGN IN above.')
        return
      }

      if (!response.ok) {
        setLocalAuthError('Registration failed. Check your details and try again.')
        return
      }

      const payload = (await response.json()) as {
        authenticated?: boolean
        user?: SessionApiUser
      }

      if (!payload.authenticated || !payload.user) {
        setLocalAuthError('Registration succeeded, but session creation failed. Try signing in.')
        return
      }

      setAuthSession(mapSessionApiUser(payload.user))
      setAuthError('')
      setLocalAuthError('')
      setLocalAuthNotice('Account created successfully.')
      setBackendAvailable(true)
      setLocalRegisterPassword('')
      setLocalLoginPassword('')
    } catch {
      setBackendAvailable(false)
      setLocalAuthError('Registration failed because the backend server is unavailable. Start it with npm run dev or npm run start:server, then try again.')
    } finally {
      setLocalRegisterPending(false)
    }
  }

  const handleLocalLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const email = localLoginEmail.trim().toLowerCase()
    const password = localLoginPassword

    if (!email || !email.includes('@')) {
      setLocalAuthError('Enter the email address you registered with.')
      return
    }

    if (!password) {
      setLocalAuthError('Enter your password.')
      return
    }

    setLocalLoginPending(true)
    setLocalAuthError('')
    setLocalAuthNotice('')

    try {
      const response = await fetch(apiUrl('/api/auth/local/login'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, rememberMe: rememberMeNextLogin }),
      })

      if (response.status === 401) {
        setLocalAuthError('Email or password is incorrect.')
        return
      }

      if (!response.ok) {
        setLocalAuthError('Email sign-in failed. Please try again.')
        return
      }

      const payload = (await response.json()) as {
        authenticated?: boolean
        user?: SessionApiUser
      }

      if (!payload.authenticated || !payload.user) {
        setLocalAuthError('Email sign-in could not create a persistent session.')
        return
      }

      setAuthSession(mapSessionApiUser(payload.user))
      setAuthError('')
      setLocalAuthError('')
      setLocalAuthNotice('')
      setBackendAvailable(true)
      setLocalLoginPassword('')

      if (rememberMeNextLogin) {
        setCookieValue(REMEMBER_LOGIN_EMAIL_COOKIE, email, 30)
      } else {
        clearCookieValue(REMEMBER_LOGIN_EMAIL_COOKIE)
      }
    } catch {
      setBackendAvailable(false)
      setLocalAuthError('Email sign-in failed because the backend server is unavailable. Start it with npm run dev or npm run start:server, then try again.')
    } finally {
      setLocalLoginPending(false)
    }
  }

  const saveTicketChanges = async () => {
    if (!selectedTicket || !detailDraft) {
      return
    }

    setDetailSavePending(true)
    setDetailSaveError('')

    try {
      const response = await fetch(apiUrl(`/api/tickets/${selectedTicket.id}`), {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: detailDraft.title,
          description: detailDraft.description,
          status: detailDraft.status,
          priority: detailDraft.priority,
          categoryId: detailDraft.categoryId,
          assignedToId: detailDraft.assignedToId || null,
        }),
      })

      if (response.status === 401) {
        setAuthSession(null)
        setDetailSaveError('Your session expired. Please sign in again.')
        return
      }

      if (!response.ok) {
        setDetailSaveError('Ticket changes could not be saved to SQL Server.')
        return
      }

      const payload = (await response.json()) as {
        ticket?: TicketRecord
      }

      if (!payload.ticket) {
        setDetailSaveError('Ticket changes could not be saved to SQL Server.')
        return
      }

      setTickets((current) =>
        current.map((ticket) =>
          ticket.id === payload.ticket?.id ? payload.ticket : ticket,
        ),
      )
    } catch {
      setDetailSaveError('Ticket changes could not be saved. Confirm the backend server is running.')
    } finally {
      setDetailSavePending(false)
    }
  }

  const applyQuickTicketAction = async (
    ticket: TicketRecord,
    action: 'assign-to-me' | 'mark-in-progress' | 'mark-resolved',
  ) => {
    if (quickActionPendingTicketId) {
      return
    }

    let nextAssignedToId = ticket.assignedToId
    let nextStatus = ticket.status

    if (action === 'assign-to-me') {
      nextAssignedToId = currentUser.id
    }

    if (action === 'mark-in-progress') {
      nextStatus = 'In Progress'
      nextAssignedToId = nextAssignedToId ?? currentUser.id
    }

    if (action === 'mark-resolved') {
      nextStatus = 'Resolved'
      nextAssignedToId = nextAssignedToId ?? currentUser.id
    }

    if (nextAssignedToId === ticket.assignedToId && nextStatus === ticket.status) {
      return
    }

    setQuickActionPendingTicketId(ticket.id)
    setQuickActionError('')

    try {
      // Optimistic update: immediately reflect the change in local state so the
      // ticket moves out of (or into) the correct queue without waiting for the
      // full server round-trip.
      setTickets((current) =>
        current.map((item) =>
          item.id === ticket.id
            ? { ...item, assignedToId: nextAssignedToId, status: nextStatus }
            : item,
        ),
      )

      const response = await fetch(apiUrl(`/api/tickets/${ticket.id}`), {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: ticket.title,
          description: ticket.description,
          status: nextStatus,
          priority: ticket.priority,
          categoryId: ticket.categoryId,
          assignedToId: nextAssignedToId,
        }),
      })

      if (response.status === 401) {
        setAuthSession(null)
        setQuickActionError('Your session expired. Please sign in again.')
        // Revert the optimistic update on auth failure
        setTickets((current) =>
          current.map((item) => (item.id === ticket.id ? ticket : item)),
        )
        return
      }

      if (!response.ok) {
        setQuickActionError('Quick action failed. Please try again.')
        // Revert the optimistic update on server error
        setTickets((current) =>
          current.map((item) => (item.id === ticket.id ? ticket : item)),
        )
        return
      }

      const payload = (await response.json()) as {
        ticket?: TicketRecord
      }

      if (!payload.ticket) {
        setQuickActionError('Quick action failed. Please try again.')
        // Revert the optimistic update if the server response is unexpected
        setTickets((current) =>
          current.map((item) => (item.id === ticket.id ? ticket : item)),
        )
        return
      }

      // Reconcile with the authoritative server response
      setTickets((current) =>
        current.map((item) => (item.id === payload.ticket!.id ? payload.ticket! : item)),
      )
    } catch {
      setQuickActionError('Quick action failed because the backend server is unavailable.')
      // Revert the optimistic update on network error
      setTickets((current) =>
        current.map((item) => (item.id === ticket.id ? ticket : item)),
      )
    } finally {
      setQuickActionPendingTicketId(null)
    }
  }

  const addTicketComment = async () => {
    if (!selectedTicket) {
      return
    }

    const message = commentDraft.trim()
    if (!message) {
      return
    }

    setCommentPending(true)
    setCommentError('')

    try {
      const response = await fetch(apiUrl(`/api/tickets/${selectedTicket.id}/comments`), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      })

      if (response.status === 401) {
        setAuthSession(null)
        setCommentError('Your session expired. Please sign in again.')
        return
      }

      if (!response.ok) {
        setCommentError('Comment could not be saved to SQL Server.')
        return
      }

      const payload = (await response.json()) as {
        comment?: TicketActivityApiRecord
      }

      if (!payload.comment) {
        setCommentError('Comment could not be saved to SQL Server.')
        return
      }

      setTickets((current) => mergePersistedActivity(current, [payload.comment as TicketActivityApiRecord]))
      setCommentDraft('')
      setDetailTab('activity')
    } catch {
      setCommentError('Comment could not be saved. Confirm the backend server is running.')
    } finally {
      setCommentPending(false)
    }
  }

  const uploadAttachment = async () => {
    if (!selectedTicket) {
      return
    }

    if (!attachmentFile) {
      setAttachmentsError('Select a file before uploading.')
      return
    }

    setAttachmentUploadPending(true)
    setAttachmentsError('')

    try {
      const formData = new FormData()
      formData.append('file', attachmentFile)

      const response = await fetch(apiUrl(`/api/tickets/${selectedTicket.id}/attachments`), {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      if (response.status === 401) {
        setAuthSession(null)
        setAttachmentsError('Your session expired. Please sign in again.')
        return
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        setAttachmentsError(
          payload?.error === 'attachment_too_large'
            ? 'Attachments must be 10 MB or smaller.'
            : 'Attachment upload failed.',
        )
        return
      }

      const payload = (await response.json()) as {
        attachment?: TicketAttachment
      }

      if (payload.attachment) {
        setAttachments((current) => [payload.attachment as TicketAttachment, ...current])
      }
      setAttachmentFile(null)
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = ''
      }
      await refreshTicket(selectedTicket.id)
    } catch {
      setAttachmentsError('Attachment upload failed. Confirm the backend server is running.')
    } finally {
      setAttachmentUploadPending(false)
    }
  }

  const downloadAttachment = async (attachment: TicketAttachment) => {
    if (!selectedTicket) {
      return
    }

    try {
      const response = await fetch(
        apiUrl(`/api/tickets/${selectedTicket.id}/attachments/${attachment.id}`),
        {
          credentials: 'include',
        },
      )

      if (response.status === 401) {
        setAuthSession(null)
        setAttachmentsError('Your session expired. Please sign in again.')
        return
      }

      if (!response.ok) {
        setAttachmentsError('Attachment download failed.')
        return
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = attachment.fileName
      link.click()
      window.URL.revokeObjectURL(url)
    } catch {
      setAttachmentsError('Attachment download failed. Confirm the backend server is running.')
    }
  }

  const removeAttachment = async (attachmentId: string) => {
    if (!selectedTicket) {
      return
    }

    setAttachmentDeletePendingId(attachmentId)
    setAttachmentsError('')

    try {
      const response = await fetch(
        apiUrl(`/api/tickets/${selectedTicket.id}/attachments/${attachmentId}`),
        {
          method: 'DELETE',
          credentials: 'include',
        },
      )

      if (response.status === 401) {
        setAuthSession(null)
        setAttachmentsError('Your session expired. Please sign in again.')
        return
      }

      if (!response.ok) {
        setAttachmentsError('Attachment delete failed.')
        return
      }

      setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId))
      await refreshTicket(selectedTicket.id)
    } catch {
      setAttachmentsError('Attachment delete failed. Confirm the backend server is running.')
    } finally {
      setAttachmentDeletePendingId(null)
    }
  }

  const updateRapidIdentityVisibility = async (isEnabled: boolean) => {
    setAuthSettingsPending(true)
    setAuthSettingsError('')

    try {
      const response = await fetch(apiUrl('/api/settings/auth'), {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rapidIdentityEnabled: isEnabled }),
      })

      if (response.status === 401) {
        setAuthSession(null)
        setAuthSettingsError('Your session expired. Please sign in again.')
        return
      }

      if (response.status === 403) {
        setAuthSettingsError('Only admins can update authentication settings.')
        return
      }

      if (!response.ok) {
        setAuthSettingsError('Authentication setting could not be updated.')
        return
      }

      const payload = (await response.json()) as {
        rapidIdentityEnabled?: boolean
      }

      if (typeof payload.rapidIdentityEnabled === 'boolean') {
        setRapidIdentityEnabled(payload.rapidIdentityEnabled)
      }
    } catch {
      setAuthSettingsError('Authentication setting could not be updated. Confirm the backend server is running.')
    } finally {
      setAuthSettingsPending(false)
    }
  }

  const createTicket = async () => {
    if (
      !newTicketForm.title.trim() ||
      !newTicketForm.requestorName.trim() ||
      !newTicketForm.requestorEmail.trim() ||
      !newTicketForm.description.trim() ||
      !newTicketForm.categoryId
    ) {
      return
    }

    setCreateTicketPending(true)
    setCreateTicketError('')

    try {
      const response = await fetch(apiUrl('/api/tickets'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newTicketForm.title.trim(),
          description: newTicketForm.description.trim(),
          priority: newTicketForm.priority,
          teamId: currentUser.teamId,
          categoryId: newTicketForm.categoryId,
          assignedToId: newTicketForm.assignedToId || null,
          requestorName: newTicketForm.requestorName.trim(),
          requestorEmail: newTicketForm.requestorEmail.trim(),
          location: newTicketForm.location.trim(),
        }),
      })

      if (response.status === 401) {
        setAuthSession(null)
        setCreateTicketError('Your session expired. Please sign in again.')
        return
      }

      if (response.status === 403) {
        setCreateTicketError('You can only create tickets for your own team.')
        return
      }

      if (!response.ok) {
        setCreateTicketError('Ticket could not be created in SQL Server.')
        return
      }

      const payload = (await response.json()) as {
        ticket?: TicketRecord
      }

      if (!payload.ticket) {
        setCreateTicketError('Ticket could not be created in SQL Server.')
        return
      }

      setTickets((current) => [payload.ticket as TicketRecord, ...current])
      setNewTicketForm({
        title: '',
        requestorName: '',
        requestorEmail: '',
        location: '',
        categoryId: currentTeamCategories[0]?.id ?? '',
        assignedToId: '',
        priority: 'Medium',
        description: '',
      })
      startTransition(() => {
        setActiveView('team-tickets')
        setDetailTicketId(payload.ticket?.id ?? null)
      })
    } catch {
      setCreateTicketError('Ticket could not be created. Confirm the backend server is running.')
    } finally {
      setCreateTicketPending(false)
    }
  }

  const exportVisibleTickets = () => {
    const rows = visibleTickets.map((ticket) => ({
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      team: getTeamById(ticket.teamId)?.name ?? 'Unknown',
      category: getCategoryById(ticket.categoryId)?.name ?? 'Unknown',
      assignedTo: getUserById(ticket.assignedToId)?.name ?? 'Unassigned',
      requestor: ticket.requestorName,
      email: ticket.requestorEmail,
      updatedAt: formatDateTime(ticket.updatedAt),
    }))

    const csv = [
      'Ticket ID,Title,Status,Priority,Team,Category,Assigned To,Requestor,Email,Updated',
      ...rows.map((row) =>
        Object.values(row)
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(','),
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `team-support-pro-${activeView}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const addTeam = () => {
    if (!teamForm.name.trim()) {
      return
    }

    const teamId = slugify(teamForm.name)
    if (teams.some((team) => team.id === teamId)) {
      return
    }

    setTeams((current) => [
      ...current,
      {
        id: teamId,
        name: teamForm.name.trim(),
        code: teamForm.code.trim().toUpperCase() || teamForm.name.trim().slice(0, 3).toUpperCase(),
        accent: teamForm.accent,
      },
    ])
    setTeamForm({ name: '', code: '', accent: '#0078d4' })
    setCategoryForm((current) => ({ ...current, teamId }))
  }

  const updateTeam = (teamId: string, field: 'name' | 'code' | 'accent', value: string) => {
    setTeams((current) =>
      current.map((team) =>
        team.id === teamId
          ? {
              ...team,
              [field]: field === 'code' ? value.toUpperCase() : value,
            }
          : team,
      ),
    )
  }

  const addCategory = () => {
    if (!categoryForm.name.trim() || !categoryForm.teamId) {
      return
    }

    setCategories((current) => [
      ...current,
      {
        id: `cat-${slugify(categoryForm.teamId)}-${slugify(categoryForm.name)}`,
        teamId: categoryForm.teamId,
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim() || 'Custom admin category.',
      },
    ])
    setCategoryForm((current) => ({
      ...current,
      name: '',
      description: '',
    }))
  }

  const updateCategory = (
    categoryId: string,
    field: 'teamId' | 'name' | 'description',
    value: string,
  ) => {
    setCategories((current) =>
      current.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              [field]: value,
            }
          : category,
      ),
    )
  }

  const addUser = async () => {
    if (!userForm.name.trim() || !userForm.email.trim() || !userForm.teamId) {
      setUserDirectoryError('Name, email, and team are required before adding a user.')
      setUserDirectoryNotice('')
      return
    }

    const normalizedEmail = userForm.email.trim().toLowerCase()
    if (users.some((user) => user.email.toLowerCase() === normalizedEmail)) {
      setUserDirectoryError('A user with that email already exists.')
      setUserDirectoryNotice('')
      return
    }

    setUserDirectoryError('')
    setUserDirectoryNotice('')
    setUserFormPending(true)

    try {
      const response = await fetch(apiUrl('/api/users'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name: userForm.name.trim(),
          email: normalizedEmail,
          teamId: userForm.teamId,
          role: userForm.role,
        }),
      })

      if (response.status === 401) {
        setAuthSession(null)
        setUserDirectoryError('Your session expired. Please sign in again.')
        return
      }

      if (response.status === 403) {
        setUserDirectoryError('Only admins can manage users.')
        return
      }

      if (!response.ok) {
        setUserDirectoryError('User could not be created in SQL Server.')
        return
      }

      const payload = (await response.json()) as {
        user?: User
      }

      if (!payload.user) {
        setUserDirectoryError('User could not be created in SQL Server.')
        return
      }

      setUsers((current) => [...current, payload.user as User])
      setUserForm({ name: '', email: '', teamId: currentUser.teamId, role: 'Staff' })
      setUserDirectoryNotice('User added successfully.')
      await refreshAuthSession()
    } catch {
      setUserDirectoryError('User could not be created. Confirm the backend server is running.')
    } finally {
      setUserFormPending(false)
    }
  }

  const updateUser = (
    userId: string,
    field: 'name' | 'email' | 'teamId' | 'role',
    value: string,
  ) => {
    setUsers((current) =>
      current.map((user) =>
        user.id === userId
          ? {
              ...user,
              [field]: field === 'email' ? value.toLowerCase() : value,
            }
          : user,
      ),
    )
  }

  const persistUser = async (user: User) => {
    const normalizedUser = {
      ...user,
      name: user.name.trim(),
      email: user.email.trim().toLowerCase(),
      teamId: user.teamId.trim(),
    }

    if (!normalizedUser.name || !normalizedUser.email || !normalizedUser.teamId) {
      setUserDirectoryError('Each user needs a name, email, and team before changes can be saved.')
      setUserDirectoryNotice('')
      return
    }

    setUserDirectoryError('')
    setUserDirectoryNotice('')
    setUserSavePendingIds((current) =>
      current.includes(normalizedUser.id) ? current : [...current, normalizedUser.id],
    )

    try {
      const response = await fetch(apiUrl(`/api/users/${normalizedUser.id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(normalizedUser),
      })

      if (response.status === 401) {
        setAuthSession(null)
        setUserDirectoryError('Your session expired. Please sign in again.')
        return
      }

      if (response.status === 403) {
        setUserDirectoryError('Only admins can manage users.')
        return
      }

      if (!response.ok) {
        setUserDirectoryError('User changes could not be saved to SQL Server.')
        return
      }

      const payload = (await response.json()) as {
        user?: User
      }

      if (!payload.user) {
        setUserDirectoryError('User changes could not be saved to SQL Server.')
        return
      }

      setUsers((current) =>
        current.map((entry) => (entry.id === payload.user?.id ? (payload.user as User) : entry)),
      )
      setUserDirectoryNotice('User changes saved.')
      await refreshAuthSession()
    } catch {
      setUserDirectoryError('User changes could not be saved. Confirm the backend server is running.')
    } finally {
      setUserSavePendingIds((current) => current.filter((entry) => entry !== normalizedUser.id))
    }
  }

  const handleChangePassword = async () => {
    if (!changePasswordModal) return
    if (changePasswordValue.length < 8) {
      setChangePasswordError('Password must be at least 8 characters.')
      return
    }
    setChangePasswordError('')
    setChangePasswordPending(true)
    try {
      const response = await fetch(apiUrl(`/api/users/${changePasswordModal.userId}/change-password`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newPassword: changePasswordValue }),
      })
      if (response.status === 401) { setAuthSession(null); return }
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string }
        setChangePasswordError(payload.message ?? 'Password change failed.')
        return
      }
      setChangePasswordModal(null)
      setChangePasswordValue('')
      setUserDirectoryNotice(`Password updated for ${changePasswordModal.userName}.`)
    } catch {
      setChangePasswordError('Could not reach the server. Check your connection.')
    } finally {
      setChangePasswordPending(false)
    }
  }

  const metricCards: Array<{
    id: DashboardWidgetId
    label: string
    value: number
    accent: string
    icon: LucideIcon
  }> = [
    {
      id: 'metric-total',
      label: 'Total Tickets',
      value: dashboardStats.total,
      accent: 'bg-blue-50 text-sky-700',
      icon: Ticket,
    },
    {
      id: 'metric-open',
      label: 'Open',
      value: dashboardStats.open,
      accent: 'bg-blue-50 text-sky-700',
      icon: RefreshCw,
    },
    {
      id: 'metric-progress',
      label: 'In Progress',
      value: dashboardStats.inProgress,
      accent: 'bg-amber-50 text-amber-700',
      icon: Clock3,
    },
    {
      id: 'metric-pending',
      label: 'Pending',
      value: dashboardStats.pending,
      accent: 'bg-orange-50 text-orange-700',
      icon: TriangleAlert,
    },
    {
      id: 'metric-critical',
      label: 'Critical',
      value: dashboardStats.critical,
      accent: 'bg-red-50 text-red-700',
      icon: TriangleAlert,
    },
  ]

  const paletteStyle = {
    '--app-bg': activePalette.appBg,
    '--header-bg': activePalette.headerBg,
    '--menu-bg': activePalette.menuBg,
    '--card-bg': activePalette.cardBg,
    '--panel-bg': activePalette.panelBg,
    '--input-bg': activePalette.inputBg,
    '--button-bg': activePalette.buttonBg,
    '--accent': activePalette.accent,
    '--text': activePalette.text,
    '--text-muted': activePalette.textMuted,
    '--border': activePalette.border,
    '--button-text': activePalette.buttonText,
    '--detail-panel-width': `${detailWidth}vw`,
  } as CSSProperties

  const currentViewLabel =
    activeView === 'notifications'
      ? 'Notifications'
      : visibleNavItems.find((item) => item.id === activeView)?.label ?? 'Settings'

  const resetDashboardLayout = () => {
    window.localStorage.removeItem(dashboardLayoutStorageKey)
    setDashboardLayouts(mergeDashboardLayouts(null))
  }

  const renderDashboardWidget = (widgetId: DashboardWidgetId) => {
    const metricCard = metricCards.find((card) => card.id === widgetId)

    if (metricCard) {
      const Icon = metricCard.icon

      return (
        <section className="surface dashboard-widget-panel p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-[color:var(--text-muted)]">
            <div className="text-xs font-semibold uppercase tracking-[0.12em]">Metric Card</div>
            <div className="dashboard-widget-handle flex items-center gap-1 text-xs uppercase tracking-[0.12em]">
              <Grip className="h-4 w-4" />
              Move
            </div>
          </div>
          <div className="flex items-start justify-between gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-[2px] ${metricCard.accent}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="text-right">
              <div className="font-mono text-2xl font-semibold text-[color:var(--text)]">
                {metricCard.value}
              </div>
              <div className="text-xs uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                {metricCard.label}
              </div>
            </div>
          </div>
        </section>
      )
    }

    if (widgetId === 'trends') {
      return (
        <section className="surface dashboard-widget-panel p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="text-xl font-semibold">Ticket Trend by Team</div>
              <div className="text-sm text-[color:var(--text-muted)]">
                Daily ticket volume over the last 21 days.
              </div>
            </div>
            <div className="dashboard-widget-handle flex items-center gap-1 text-xs uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
              <Grip className="h-4 w-4" />
              Move / Resize
            </div>
          </div>
          <div className="dashboard-chart-body min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 2,
                    border: '1px solid var(--border)',
                    background: 'var(--panel-bg)',
                    color: 'var(--text)',
                  }}
                />
                <Legend />
                {teams.map((team) => (
                  <Line
                    key={team.id}
                    type="monotone"
                    dataKey={team.id}
                    stroke={team.accent}
                    strokeWidth={2.5}
                    dot={false}
                    name={team.name}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )
    }

    if (widgetId === 'status') {
      return (
        <section className="surface dashboard-widget-panel p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="text-xl font-semibold">Status Overview</div>
              <div className="text-sm text-[color:var(--text-muted)]">
                Live mix across all support teams.
              </div>
            </div>
            <div className="dashboard-widget-handle flex items-center gap-1 text-xs uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
              <Grip className="h-4 w-4" />
              Move / Resize
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-auto pr-1">
            {statusCounts.map(({ status, count }) => {
              const max = Math.max(...statusCounts.map((item) => item.count), 1)
              return (
                <div key={status}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className={getStatusBadgeClass(status)}>{status}</span>
                    <span className="font-mono text-sm text-[color:var(--text)]">{count}</span>
                  </div>
                  <div className="h-2 rounded-[2px] bg-black/[0.06]">
                    <div
                      className="h-2 rounded-[2px] bg-[color:var(--accent)]"
                      style={{ width: `${(count / max) * 100}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )
    }

    if (widgetId === 'queue') {
      return (
        <section className="surface dashboard-widget-panel p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="text-xl font-semibold">Current Team Queue</div>
              <div className="text-sm text-[color:var(--text-muted)]">
                {currentTeam.name} categories only. Reassignment is limited to {currentTeam.name} staff.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="dashboard-widget-handle flex items-center gap-1 text-xs uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                <Grip className="h-4 w-4" />
                Move / Resize
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setActiveView('team-tickets')}
              >
                Open Queue
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {renderTicketCollection()}
          </div>
        </section>
      )
    }

    return (
      <section className="surface dashboard-widget-panel p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Operational Notes</div>
            <div className="text-sm text-[color:var(--text-muted)]">
              Short operational context for the signed-in support team.
            </div>
          </div>
          <div className="dashboard-widget-handle flex items-center gap-1 text-xs uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
            <Grip className="h-4 w-4" />
            Move / Resize
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1 text-sm text-[color:var(--text-muted)]">
          <div className="surface-muted p-3">
            <div className="mb-1 font-semibold text-[color:var(--text)]">
              Team isolation
            </div>
            Categories, queues, and assignee lists are filtered to the logged-in user&apos;s team.
          </div>
          <div className="surface-muted p-3">
            <div className="mb-1 font-semibold text-[color:var(--text)]">
              Future integrations
            </div>
            Mock data is active today. The state model is ready to swap to hosted services and Azure SQL later.
          </div>
          <div className="surface-muted p-3">
            <div className="mb-1 font-semibold text-[color:var(--text)]">
              Team workload
            </div>
            <div className="space-y-2">
              {teams.map((team) => {
                const total = teamWorkload.find((entry) => entry.teamId === team.id)?.count ?? 0
                const Icon = teamIcons[team.id] ?? Building2
                return (
                  <div key={team.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[color:var(--text)]">
                      <Icon className="h-4 w-4" style={{ color: team.accent }} />
                      {team.name}
                    </div>
                    <div className="font-mono">{total}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>
    )
  }

  const renderNotificationsPage = () => {
    if (notificationItems.length === 0) {
      return (
        <div className="surface flex min-h-56 items-center justify-center p-8 text-sm text-[color:var(--text-muted)]">
          No notifications yet for tickets assigned to you.
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <section className="surface p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xl font-semibold">Recent Activity Notifications</div>
              <div className="text-sm text-[color:var(--text-muted)]">
                Activity on tickets assigned to you. Opening this page marks visible items as read.
              </div>
            </div>
            <div className="rounded-[2px] border border-[color:var(--border)] px-3 py-2 text-xs uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
              {unreadNotificationCount} unread
            </div>
          </div>

          <div className="space-y-3">
            {notificationItems.map((item) => {
              const isUnread = !readNotificationIdSet.has(item.id)

              return (
                <div
                  key={item.id}
                  className="surface-muted flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between"
                  data-unread={isUnread}
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[color:var(--accent)]">
                        {item.ticketId}
                      </span>
                      {isUnread && (
                        <span className="badge badge-red">Unread</span>
                      )}
                    </div>
                    <div className="text-base font-semibold text-[color:var(--text)]">{item.ticketTitle}</div>
                    <div className="text-sm text-[color:var(--text-muted)]">
                      <span className="font-semibold text-[color:var(--text)]">{item.actor}</span> {item.message}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-3 md:items-end">
                    <div className="text-xs uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                      {formatDateTime(item.at)}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      <button
                        type="button"
                        className={isUnread ? 'dashboard-reset-button' : 'notification-unread-button'}
                        onClick={() => toggleNotificationReadState(item.id, !isUnread)}
                      >
                        {isUnread ? 'Mark as read' : 'Mark as unread'}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => openTicket(item.ticketId)}
                      >
                        Open Ticket
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    )
  }

  const renderSettingsAccordionSection = (section: SettingsAccordionSection) => {
    const isOpen = settingsAccordions[section]

    const renderAccordionBody = () => {
      switch (section) {
        case 'appearance':
          return (
            <div className="settings-accordion-content">
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['appBg', 'App'],
                    ['headerBg', 'Header'],
                    ['menuBg', 'Menu'],
                    ['cardBg', 'Cards'],
                    ['buttonBg', 'Buttons'],
                    ['accent', 'Accent'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="field">
                    <span className="field-label">{label}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="h-10 w-14 rounded-[2px] border border-[color:var(--border)] bg-transparent p-1"
                        value={themeConfig[settingsMode][key]}
                        onChange={(event) => updateThemeColor(settingsMode, key, event.target.value)}
                      />
                      <input
                        className="input-control font-mono"
                        value={themeConfig[settingsMode][key]}
                        onChange={(event) => updateThemeColor(settingsMode, key, event.target.value)}
                      />
                    </div>
                  </label>
                ))}
              </div>

              <div className="mt-4 flex w-fit items-center overflow-hidden rounded-[2px] border border-[color:var(--border)]">
                <button
                  type="button"
                  className="view-toggle"
                  data-active={settingsMode === 'light'}
                  onClick={() => setSettingsMode('light')}
                >
                  Light
                </button>
                <button
                  type="button"
                  className="view-toggle"
                  data-active={settingsMode === 'dark'}
                  onClick={() => setSettingsMode('dark')}
                >
                  Dark
                </button>
              </div>
            </div>
          )
        case 'authentication':
          return (
            <div className="settings-accordion-content space-y-3">
              <div className="text-sm text-[color:var(--text-muted)]">
                Control whether users can see and use Rapid Identity Sign-In on the login page.
              </div>
              <label className="flex items-center gap-3 rounded-[2px] border border-[color:var(--border)] p-3">
                <input
                  type="checkbox"
                  checked={rapidIdentityEnabled}
                  disabled={authSettingsPending}
                  onChange={(event) => {
                    const nextEnabled = event.target.checked
                    setRapidIdentityEnabled(nextEnabled)
                    void updateRapidIdentityVisibility(nextEnabled)
                  }}
                />
                <div>
                  <div className="text-sm font-semibold text-[color:var(--text)]">
                    Show Rapid Identity Sign-In
                  </div>
                  <div className="text-xs text-[color:var(--text-muted)]">
                    When disabled, the login page will only show local email sign-in.
                  </div>
                </div>
              </label>
              {authSettingsPending && (
                <div className="text-xs text-[color:var(--text-muted)]">Saving authentication setting...</div>
              )}
              {authSettingsError && (
                <div className="rounded-[2px] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {authSettingsError}
                </div>
              )}
            </div>
          )
        case 'addUser':
          return (
            <div className="settings-accordion-content grid gap-3">
              {userDirectoryError && (
                <div className="rounded-[2px] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {userDirectoryError}
                </div>
              )}
              {userDirectoryNotice && (
                <div className="rounded-[2px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {userDirectoryNotice}
                </div>
              )}
              <input
                className="input-control"
                placeholder="Full name"
                value={userForm.name}
                onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))}
              />
              <input
                className="input-control"
                placeholder="Email"
                value={userForm.email}
                onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
              />
              <select
                className="input-control"
                value={userForm.teamId}
                onChange={(event) => setUserForm((current) => ({ ...current, teamId: event.target.value }))}
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <select
                className="input-control"
                value={userForm.role}
                onChange={(event) =>
                  setUserForm((current) => ({ ...current, role: event.target.value as User['role'] }))
                }
              >
                <option value="Admin">Admin</option>
                <option value="Staff">Staff</option>
              </select>
              <button type="button" className="primary-button" onClick={addUser}>
                {userFormPending ? 'Adding...' : 'Add User'}
              </button>
            </div>
          )
        case 'manageUsers':
          return (
            <div className="settings-accordion-content space-y-3">
              {userDirectoryError && (
                <div className="rounded-[2px] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {userDirectoryError}
                </div>
              )}
              {userDirectoryNotice && (
                <div className="rounded-[2px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {userDirectoryNotice}
                </div>
              )}
              <p className="text-sm text-[color:var(--text-muted)]">
                Changes save automatically when you leave a field.
              </p>
              {users.map((user) => (
                <div
                  key={user.id}
                  className="surface-muted grid gap-3 p-3 md:grid-cols-[1.2fr_1.3fr_0.9fr_0.8fr_auto_auto] md:items-center"
                >
                  <input
                    className="input-control"
                    value={user.name}
                    onChange={(event) => updateUser(user.id, 'name', event.target.value)}
                    onBlur={() => void persistUser(user)}
                  />
                  <input
                    className="input-control"
                    value={user.email}
                    onChange={(event) => updateUser(user.id, 'email', event.target.value)}
                    onBlur={() => void persistUser(user)}
                  />
                  <select
                    className="input-control"
                    value={user.teamId}
                    onChange={(event) => {
                      const nextUser = {
                        ...user,
                        teamId: event.target.value,
                      }
                      updateUser(user.id, 'teamId', event.target.value)
                      void persistUser(nextUser)
                    }}
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input-control"
                    value={user.role}
                    onChange={(event) => {
                      const nextUser = {
                        ...user,
                        role: event.target.value as User['role'],
                      }
                      updateUser(user.id, 'role', event.target.value)
                      void persistUser(nextUser)
                    }}
                  >
                    <option value="Admin">Admin</option>
                    <option value="Staff">Staff</option>
                  </select>
                  {user.name !== 'Administrator' && (
                  <button
                    type="button"
                    className="secondary-button whitespace-nowrap"
                    onClick={() => {
                      setChangePasswordValue('')
                      setChangePasswordError('')
                      setChangePasswordModal({ userId: user.id, userName: user.name })
                    }}
                  >
                    Change Password
                  </button>
                  )}
                  <div className="text-right text-xs text-[color:var(--text-muted)]">
                    {userSavePendingIds.includes(user.id) ? 'Saving...' : 'Saved'}
                  </div>
                </div>
              ))}
            </div>
          )
        case 'manageTeams':
          return (
            <div className="settings-accordion-content">
              <div className="mb-4 grid gap-3 sm:grid-cols-[1.4fr_0.8fr_0.6fr_auto]">
                <input
                  className="input-control"
                  placeholder="Team name"
                  value={teamForm.name}
                  onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))}
                />
                <input
                  className="input-control"
                  placeholder="Code"
                  value={teamForm.code}
                  onChange={(event) => setTeamForm((current) => ({ ...current, code: event.target.value }))}
                />
                <input
                  type="color"
                  className="h-10 rounded-[2px] border border-[color:var(--border)] bg-transparent p-1"
                  value={teamForm.accent}
                  onChange={(event) => setTeamForm((current) => ({ ...current, accent: event.target.value }))}
                />
                <button type="button" className="primary-button" onClick={addTeam}>
                  Add Team
                </button>
              </div>
              <div className="space-y-3">
                {teams.map((team) => (
                  <div key={team.id} className="surface-muted grid gap-3 p-3 md:grid-cols-[1.4fr_0.7fr_0.4fr]">
                    <input
                      className="input-control"
                      value={team.name}
                      onChange={(event) => updateTeam(team.id, 'name', event.target.value)}
                    />
                    <input
                      className="input-control font-mono"
                      value={team.code}
                      onChange={(event) => updateTeam(team.id, 'code', event.target.value)}
                    />
                    <input
                      type="color"
                      className="h-10 rounded-[2px] border border-[color:var(--border)] bg-transparent p-1"
                      value={team.accent}
                      onChange={(event) => updateTeam(team.id, 'accent', event.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        case 'categories':
          return (
            <div className="settings-accordion-content">
              <div className="mb-4 grid gap-3 md:grid-cols-[0.8fr_1fr_1.6fr_auto]">
                <select
                  className="input-control"
                  value={categoryForm.teamId}
                  onChange={(event) => setCategoryForm((current) => ({ ...current, teamId: event.target.value }))}
                >
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                <input
                  className="input-control"
                  placeholder="Category name"
                  value={categoryForm.name}
                  onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
                />
                <input
                  className="input-control"
                  placeholder="Category description"
                  value={categoryForm.description}
                  onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))}
                />
                <button type="button" className="primary-button" onClick={addCategory}>
                  Add Category
                </button>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {categories.map((category) => (
                  <div key={category.id} className="surface-muted grid gap-3 p-3 text-sm md:grid-cols-[0.85fr_1fr_1.4fr]">
                    <select
                      className="input-control"
                      value={category.teamId}
                      onChange={(event) => updateCategory(category.id, 'teamId', event.target.value)}
                    >
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input-control"
                      value={category.name}
                      onChange={(event) => updateCategory(category.id, 'name', event.target.value)}
                    />
                    <input
                      className="input-control"
                      value={category.description}
                      onChange={(event) => updateCategory(category.id, 'description', event.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
      }
    }

    const accordionMetadata: Record<
      SettingsAccordionSection,
      { title: string; description: string }
    > = {
      appearance: {
        title: 'Appearance',
        description: 'Theme colors and light or dark mode defaults.',
      },
      authentication: {
        title: 'Authentication',
        description: 'Configure available login methods.',
      },
      addUser: {
        title: 'Add User',
        description: 'Create a new admin or staff account.',
      },
      manageUsers: {
        title: 'Manage Users',
        description: 'Update names, emails, teams, and roles.',
      },
      manageTeams: {
        title: 'Manage Teams',
        description: 'Add or update team names, codes, and accent colors.',
      },
      categories: {
        title: 'Categories',
        description: 'Add new categories and maintain team mappings.',
      },
    }

    const { title, description } = accordionMetadata[section]

    return (
      <section
        key={section}
        className="surface p-4 settings-accordion-shell"
        data-drag-over={settingsDragOverSection === section && draggedSettingsSection !== section}
        onDragOver={(event) => {
          if (!draggedSettingsSection) {
            return
          }

          event.preventDefault()
          if (settingsDragOverSection !== section) {
            setSettingsDragOverSection(section)
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          if (draggedSettingsSection) {
            reorderSettingsAccordions(draggedSettingsSection, section)
          }
          endSettingsAccordionDrag()
        }}
      >
        <div className="settings-accordion-header">
          <button
            type="button"
            className="settings-drag-handle"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move'
              startSettingsAccordionDrag(section)
            }}
            onDragEnd={endSettingsAccordionDrag}
            aria-label={`Drag ${title}`}
            title="Drag to reorder"
          >
            <Grip className="h-4 w-4" />
          </button>

          <button
            type="button"
            className="settings-accordion-toggle"
            onClick={() => toggleSettingsAccordion(section)}
            aria-expanded={isOpen}
          >
            <div>
              <div className="text-xl font-semibold">{title}</div>
              <div className="text-sm text-[color:var(--text-muted)]">{description}</div>
            </div>
            <ChevronDown className="settings-accordion-icon h-5 w-5" data-open={isOpen} />
          </button>
        </div>

        {isOpen && renderAccordionBody()}
      </section>
    )
  }

  const renderAdminSettingsPage = () => (
    <div className="space-y-4">
      <section className="surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Administrator Settings</div>
            <div className="text-sm text-[color:var(--text-muted)]">
              Drag the handle on the left to move the sections you use most to the top. Your layout is saved per signed-in user.
            </div>
          </div>
          <div className="rounded-[2px] border border-[color:var(--border)] px-3 py-2 text-xs uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
            {currentUser.role}
          </div>
        </div>
      </section>

      {settingsAccordionOrder.map((section) => renderSettingsAccordionSection(section))}
    </div>
  )

  const renderTicketCollection = () => {
    if (visibleTickets.length === 0) {
      return (
        <div className="surface flex min-h-56 items-center justify-center p-8 text-sm text-[color:var(--text-muted)]">
          No tickets match the current team scope and filters.
        </div>
      )
    }

    const renderQuickActions = (ticket: TicketRecord) => {
      const isPending = quickActionPendingTicketId === ticket.id
      const disableAssign = isPending || ticket.assignedToId === currentUser.id
      const disableInProgress = isPending || ticket.status === 'In Progress'
      const disableResolve = isPending || ticket.status === 'Resolved'
      const showAssignAction =
        activeView !== 'my-tickets' && ticket.assignedToId !== currentUser.id

      return (
        <div className="flex flex-wrap items-center gap-2">
          {showAssignAction && (
            <button
              type="button"
              className="secondary-button"
              disabled={disableAssign}
              onClick={() => applyQuickTicketAction(ticket, 'assign-to-me')}
            >
              {isPending ? 'Updating...' : 'Assign to me'}
            </button>
          )}
          <button
            type="button"
            className="secondary-button"
            disabled={disableInProgress}
            onClick={() => applyQuickTicketAction(ticket, 'mark-in-progress')}
          >
            In Progress
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={disableResolve}
            onClick={() => applyQuickTicketAction(ticket, 'mark-resolved')}
          >
            Resolve
          </button>
        </div>
      )
    }

    if (listMode === 'cards') {
      return (
        <div className="space-y-3">
          {quickActionError && (
            <div className="rounded-[2px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {quickActionError}
            </div>
          )}
          <div className="grid gap-3 xl:grid-cols-2">
            {visibleTickets.map((ticket) => {
              const category = getCategoryById(ticket.categoryId)
              const assignee = getUserById(ticket.assignedToId)
              const team = getTeamById(ticket.teamId)
              const attachmentCount = ticket.attachmentCount ?? 0

              return (
                <div
                  key={ticket.id}
                  className="surface text-left transition hover:-translate-y-0.5"
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => openTicket(ticket.id)}
                  >
                    <div className="flex items-start justify-between gap-4 p-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-[color:var(--accent)]">
                            {ticket.id}
                          </span>
                          {attachmentCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--panel-bg)] px-2 py-0.5 text-xs text-[color:var(--text-muted)]">
                              <Paperclip className="h-3.5 w-3.5" />
                              {attachmentCount}
                            </span>
                          )}
                          <span className={getStatusBadgeClass(ticket.status)}>{ticket.status}</span>
                          <span className={getPriorityBadgeClass(ticket.priority)}>{ticket.priority}</span>
                        </div>
                        <h3 className="text-base font-semibold text-[color:var(--text)]">
                          {ticket.title}
                        </h3>
                        <p className="text-sm text-[color:var(--text-muted)]">
                          {ticket.requestorName} • {category?.name ?? 'Unmapped category'} •{' '}
                          {team?.name ?? 'Unknown team'}
                        </p>
                      </div>
                      <div className="text-right text-xs text-[color:var(--text-muted)]">
                        <div>{ticket.dueLabel}</div>
                        <div>{formatDateTime(ticket.updatedAt)}</div>
                      </div>
                    </div>
                  </button>
                  <div className="border-t border-[color:var(--border)] px-4 py-3 text-sm text-[color:var(--text-muted)]">
                    <div className="mb-3">Assigned to {assignee?.name ?? 'Unassigned'}</div>
                    {renderQuickActions(ticket)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    return (
      <div className="surface overflow-hidden">
        {quickActionError && (
          <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {quickActionError}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/[0.02] text-xs uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
              <tr>
                <th className="px-4 py-3 font-semibold">Ticket #</th>
                <th className="px-4 py-3 font-semibold">Title</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Assigned To</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                <th className="px-4 py-3 font-semibold">Quick Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleTickets.map((ticket) => (
                <tr
                  key={ticket.id}
                  className="border-t border-[color:var(--border)] transition hover:bg-black/[0.03]"
                >
                  <td className="px-4 py-3 align-top">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 font-mono font-semibold text-[color:var(--accent)]"
                      onClick={() => openTicket(ticket.id)}
                    >
                      {ticket.id}
                      {(ticket.attachmentCount ?? 0) > 0 && <Paperclip className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="font-semibold text-[color:var(--text)]">{ticket.title}</div>
                    <div className="text-[color:var(--text-muted)]">{ticket.requestorName}</div>
                  </td>
                  <td className="px-4 py-3 align-top text-[color:var(--text-muted)]">
                    {getCategoryById(ticket.categoryId)?.name ?? 'Unknown'}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className={getStatusBadgeClass(ticket.status)}>{ticket.status}</span>
                  </td>
                  <td className="px-4 py-3 align-top text-[color:var(--text-muted)]">
                    {getUserById(ticket.assignedToId)?.name ?? 'Unassigned'}
                  </td>
                  <td className="px-4 py-3 align-top text-[color:var(--text-muted)]">
                    {formatDateTime(ticket.updatedAt)}
                  </td>
                  <td className="px-4 py-3 align-top">{renderQuickActions(ticket)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const renderSidebarNav = (collapsed: boolean, mobile = false) => (
    <>
      <div className="flex h-13 items-center gap-3 border-b border-white/10 px-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-[2px] bg-[color:var(--accent)] text-sm font-bold text-white">
          TA
        </div>
        {!collapsed && (
          <div>
            <div className="text-lg font-semibold">TeamSupportPro</div>
            <div className="text-xs text-white/70">Enterprise staff support</div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4">
        {visibleNavItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="sidebar-link"
            data-active={activeView === id}
            onClick={() => {
              setActiveView(id)
              if (mobile) {
                setMobileNavOpen(false)
              }
            }}
            title={collapsed ? label : undefined}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && (
              <span className="flex-1 text-left">{label}</span>
            )}
            {!collapsed && id === 'unassigned' && unassignedCount > 0 && (
              <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                {unassignedCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        {!collapsed && (
          <div className="mb-3 rounded-[2px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-white/55">
            Version {appConfig.appVersion}
          </div>
        )}
        <div className="flex items-center gap-3 rounded-[2px] border border-white/10 bg-white/5 px-3 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-[2px] bg-[color:var(--accent)] text-sm font-semibold">
            {currentUser.name
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)}
          </div>
          {!collapsed && (
            <div>
              <div className="text-sm font-semibold">{currentUser.name}</div>
              <div className="text-xs text-white/70">{currentTeam?.name}</div>
            </div>
          )}
        </div>
      </div>
    </>
  )

  if (!authReady) {
    return (
      <div className="app-shell min-h-screen" style={{
        '--app-bg': defaultThemeConfig.light.appBg,
        '--header-bg': defaultThemeConfig.light.headerBg,
        '--menu-bg': defaultThemeConfig.light.menuBg,
        '--card-bg': defaultThemeConfig.light.cardBg,
        '--panel-bg': defaultThemeConfig.light.panelBg,
        '--input-bg': defaultThemeConfig.light.inputBg,
        '--button-bg': defaultThemeConfig.light.buttonBg,
        '--accent': defaultThemeConfig.light.accent,
        '--text': defaultThemeConfig.light.text,
        '--text-muted': defaultThemeConfig.light.textMuted,
        '--border': defaultThemeConfig.light.border,
        '--button-text': defaultThemeConfig.light.buttonText,
      } as CSSProperties}>
        <div className="login-shell flex min-h-screen items-center justify-center p-6">
          <div className="login-card w-full max-w-xl border border-[color:var(--border)] bg-[color:var(--card-bg)] p-8 text-center">
            <div className="mb-3 text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              Restoring Session
            </div>
            <h1 className="text-3xl font-semibold text-[color:var(--text)]">Loading TeamSupportPro</h1>
            <p className="mt-3 text-sm text-[color:var(--text-muted)]">
              Checking your saved session and loading persisted ticket activity.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!authSession) {
    return (
      <div className="app-shell min-h-screen" style={{
        '--app-bg': defaultThemeConfig.light.appBg,
        '--header-bg': defaultThemeConfig.light.headerBg,
        '--menu-bg': defaultThemeConfig.light.menuBg,
        '--card-bg': defaultThemeConfig.light.cardBg,
        '--panel-bg': defaultThemeConfig.light.panelBg,
        '--input-bg': defaultThemeConfig.light.inputBg,
        '--button-bg': defaultThemeConfig.light.buttonBg,
        '--accent': defaultThemeConfig.light.accent,
        '--text': defaultThemeConfig.light.text,
        '--text-muted': defaultThemeConfig.light.textMuted,
        '--border': defaultThemeConfig.light.border,
        '--button-text': defaultThemeConfig.light.buttonText,
      } as CSSProperties}>
        <div className="login-shell flex min-h-screen items-center justify-center p-6">
          <div className="login-card grid max-w-5xl gap-0 overflow-hidden border border-[color:var(--border)] bg-[color:var(--card-bg)] md:grid-cols-[1.1fr_0.9fr]">
            <div className="border-r border-[color:var(--border)] bg-[linear-gradient(135deg,#0d2f4f_0%,#123555_50%,#0f3d63_100%)] p-8 text-white md:p-10">
              <div className="mb-8 flex h-10 w-10 items-center justify-center rounded-[2px] bg-[#0078d4] text-sm font-bold">
                TA
              </div>
              <div className="space-y-5">
                <div>
                  <div className="mb-3 text-xs uppercase tracking-[0.2em] text-white/65">
                    Enterprise Staff Support
                  </div>
                  <h1 className="text-4xl font-semibold leading-tight text-white md:text-5xl">
                    Sign in to TeamSupportPro
                  </h1>
                </div>
                <p className="max-w-xl text-sm leading-7 text-white/75">
                  Sign in with your email and password to access the support workspace.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="surface-dark p-4">
                    <div className="mb-2 font-mono text-2xl font-semibold">4</div>
                    <div className="text-xs uppercase tracking-[0.12em] text-white/65">Teams</div>
                  </div>
                  <div className="surface-dark p-4">
                    <div className="mb-2 font-mono text-2xl font-semibold">9</div>
                    <div className="text-xs uppercase tracking-[0.12em] text-white/65">Categories</div>
                  </div>
                  <div className="surface-dark p-4">
                    <div className="mb-2 font-mono text-2xl font-semibold">{tickets.length}</div>
                    <div className="text-xs uppercase tracking-[0.12em] text-white/65">Active Tickets</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center p-8 md:p-10">
              <div className="w-full max-w-md space-y-5">
                <div>
                  <div className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                    Authentication
                  </div>
                  <h2 className="text-2xl font-semibold">SIGN IN</h2>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                    Sign in with your local TeamSupportPro account credentials.
                  </p>
                </div>

                <div className="grid gap-4">
                  {backendAvailable === false && (
                    <div className="rounded-[2px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      The backend auth server is offline. Start it with <span className="font-mono">npm run dev</span> or <span className="font-mono">npm run start:server</span> before signing in.
                    </div>
                  )}

                  <form className="rounded-[2px] border border-[color:var(--border)] p-4" onSubmit={handleLocalLogin}>
                    <div className="space-y-3">
                      <input
                        className="input-control"
                        placeholder="Email"
                        type="email"
                        value={localLoginEmail}
                        onChange={(event) => setLocalLoginEmail(event.target.value)}
                        autoComplete="email"
                      />
                      <input
                        className="input-control"
                        placeholder="Password"
                        type="password"
                        value={localLoginPassword}
                        onChange={(event) => setLocalLoginPassword(event.target.value)}
                        autoComplete="current-password"
                      />
                      <label className="flex items-center gap-2 text-sm text-[color:var(--text-muted)]">
                        <input
                          type="checkbox"
                          checked={rememberMeNextLogin}
                          onChange={(event) => setRememberMeNextLogin(event.target.checked)}
                        />
                        <span>Remember login</span>
                      </label>
                      <button
                        type="submit"
                        className="primary-button w-full"
                        disabled={localLoginPending || localRegisterPending}
                      >
                        {localLoginPending ? 'Signing in...' : 'SIGN IN'}
                      </button>
                    </div>
                  </form>

                  <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center" aria-hidden>
                      <div className="w-full border-t border-[color:var(--border)]" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-[color:var(--card-bg)] px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                        REGISTER BELOW
                      </span>
                    </div>
                  </div>

                  <form className="surface-muted space-y-3 p-4" onSubmit={handleLocalRegistration}>
                    <div>
                      <h3 className="text-sm font-semibold text-[color:var(--text)]">Create Account</h3>
                      <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                        Create a local login saved on this server.
                      </p>
                    </div>
                    <input
                      className="input-control"
                      placeholder="Full name"
                      value={localRegisterName}
                      onChange={(event) => setLocalRegisterName(event.target.value)}
                      autoComplete="name"
                    />
                    <input
                      className="input-control"
                      placeholder="Work email"
                      type="email"
                      value={localRegisterEmail}
                      onChange={(event) => setLocalRegisterEmail(event.target.value)}
                      autoComplete="email"
                    />
                    <input
                      className="input-control"
                      placeholder="Password (minimum 8 characters)"
                      type="password"
                      value={localRegisterPassword}
                      onChange={(event) => setLocalRegisterPassword(event.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      type="submit"
                      className="secondary-button w-full"
                      disabled={localRegisterPending || localLoginPending}
                    >
                      {localRegisterPending ? 'Creating account...' : 'REGISTER'}
                    </button>
                  </form>
                </div>

                {authError && (
                  <div className="rounded-[2px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {authError}
                  </div>
                )}

                {localAuthError && (
                  <div className="rounded-[2px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {localAuthError}
                  </div>
                )}

                {localAuthNotice && (
                  <div className="rounded-[2px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                    {localAuthNotice}
                  </div>
                )}

                <div className="text-xs leading-6 text-[color:var(--text-muted)]">
                  Local accounts persist in a server file at .local-auth-accounts.json.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell min-h-screen" style={paletteStyle}>
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close navigation"
              className="fixed inset-0 z-30 bg-slate-950/45 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              onClick={() => setMobileNavOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-40 flex w-[18rem] max-w-[88vw] flex-col border-r border-[color:var(--border)] bg-[color:var(--menu-bg)] text-white md:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.24, ease: 'easeInOut' }}
            >
              {renderSidebarNav(false, true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-h-screen">
        <motion.aside
          animate={{ width: sidebarCollapsed ? 76 : 248 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="hidden shrink-0 flex-col border-r border-[color:var(--border)] bg-[color:var(--menu-bg)] text-white md:flex"
        >
          {renderSidebarNav(sidebarCollapsed)}
        </motion.aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-[color:var(--border)] bg-[color:var(--header-bg)] text-white">
            <div className="flex min-h-13 flex-wrap items-center justify-between gap-3 px-4 py-2 lg:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  className="icon-button text-white"
                  onClick={() => {
                    if (isMobileViewport) {
                      setMobileNavOpen(true)
                      return
                    }

                    setSidebarCollapsed((current) => !current)
                  }}
                >
                  {isMobileViewport ? (
                    <PanelLeftOpen className="h-5 w-5" />
                  ) : sidebarCollapsed ? (
                    <PanelLeftOpen className="h-5 w-5" />
                  ) : (
                    <PanelLeftClose className="h-5 w-5" />
                  )}
                </button>
                <label className="relative hidden w-[28rem] max-w-full md:block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/55" />
                  <input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    className="h-10 w-full rounded-[2px] border border-white/10 bg-white/6 pl-9 pr-4 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/25"
                    placeholder="Search tickets..."
                  />
                </label>
              </div>

              <div className="flex items-center gap-2">
                <div className="hidden text-right lg:block">
                  <div className="text-sm font-semibold text-white">{currentUser.name}</div>
                  <div className="text-xs text-white/65">{currentUser.email}</div>
                </div>

                <button
                  type="button"
                  className="icon-button text-white"
                  onClick={() =>
                    setThemeMode((current) =>
                      current === 'light' ? 'dark' : 'light',
                    )
                  }
                >
                  {themeMode === 'light' ? (
                    <Moon className="h-5 w-5" />
                  ) : (
                    <SunMedium className="h-5 w-5" />
                  )}
                </button>

                <div
                  className="notification-bell relative"
                  ref={notificationsPreviewRef}
                >
                  <button
                    type="button"
                    className="icon-button relative text-white"
                    onClick={() => setNotificationsPreviewOpen((current) => !current)}
                    aria-label={`Notifications${unreadNotificationCount ? ` (${unreadNotificationCount} unread)` : ''}`}
                    aria-expanded={notificationsPreviewOpen}
                    aria-haspopup="dialog"
                  >
                    <Bell className="h-5 w-5" />
                    {unreadNotificationCount > 0 && (
                      <span className="notification-badge absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
                        {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                      </span>
                    )}
                  </button>

                  {notificationsPreviewOpen && (
                    <>
                      {isMobileViewport && (
                        <button
                          type="button"
                          className="fixed inset-0 z-30 bg-slate-950/35"
                          aria-label="Close notifications preview"
                          onClick={() => setNotificationsPreviewOpen(false)}
                        />
                      )}
                      <div
                        className={`notification-preview surface z-40 p-3 text-[color:var(--text)] shadow-[0_20px_60px_rgba(13,47,79,0.18)] ${
                          isMobileViewport
                            ? 'fixed left-1/2 top-1/2 w-[min(22rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto'
                            : 'absolute right-0 top-full mt-2 w-[22rem] max-w-[calc(100vw-2rem)]'
                        }`}
                        role="dialog"
                        aria-modal={isMobileViewport}
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold">Recent notifications</div>
                          <div className="text-xs uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                            {unreadNotificationCount} unread
                          </div>
                        </div>

                        <div className="space-y-2">
                          {notificationPreviewItems.length > 0 ? (
                            notificationPreviewItems.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className="notification-preview-item surface-muted block w-full p-3 text-left"
                                onClick={() => {
                                  openTicket(item.ticketId)
                                  setNotificationsPreviewOpen(false)
                                }}
                              >
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    {!readNotificationIdSet.has(item.id) && (
                                      <span className="notification-unread-dot" aria-hidden="true" />
                                    )}
                                    <span className="font-mono text-xs font-semibold text-[color:var(--accent)]">
                                      {item.ticketId}
                                    </span>
                                  </div>
                                  <span className="text-xs text-[color:var(--text-muted)]">{formatDateTime(item.at)}</span>
                                </div>
                                <div className="text-sm font-semibold text-[color:var(--text)]">{item.ticketTitle}</div>
                                <div className="mt-1 text-sm text-[color:var(--text-muted)] line-clamp-2">
                                  <span className="font-semibold text-[color:var(--text)]">{item.actor}</span> {item.message}
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="surface-muted p-3 text-sm text-[color:var(--text-muted)]">
                              No recent messages.
                            </div>
                          )}
                        </div>

                        <div className="mt-3 flex justify-end border-t border-[color:var(--border)] pt-3">
                          <button
                            type="button"
                            className="dashboard-reset-button"
                            onClick={openNotificationsPage}
                          >
                            View all
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {currentUser.role === 'Admin' && (
                  <button
                    type="button"
                    className="icon-button text-white"
                    onClick={() => setActiveView('settings')}
                  >
                    <Settings2 className="h-5 w-5" />
                  </button>
                )}

                <button
                  type="button"
                  className="secondary-button border-white/20 bg-white/5 px-3 py-2 text-white hover:bg-white/12"
                  style={{ color: '#ffffff' }}
                  onClick={signOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>

            <div className="border-t border-white/8 px-4 pb-3 md:hidden">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/55" />
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  className="h-10 w-full rounded-[2px] border border-white/10 bg-white/6 pl-9 pr-4 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/25"
                  placeholder="Search tickets..."
                />
              </label>
            </div>
          </header>

          <div className="sticky top-[6.6rem] z-10 border-b border-[color:var(--border)] bg-[color:var(--card-bg)] md:top-13">
            <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
              <div>
                <div className="text-lg font-semibold">
                  {currentViewLabel}
                </div>
                <div className="text-sm text-[color:var(--text-muted)]">
                  {activeView === 'dashboard'
                    ? `${tickets.length} total tickets`
                    : activeView === 'notifications'
                      ? `${unreadNotificationCount} unread items assigned to you`
                    : activeView === 'settings'
                      ? `${users.length} users across ${teams.length} teams`
                    : `${visibleTickets.length} tickets in ${currentTeam.name}`}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activeView !== 'settings' && activeView !== 'notifications' && (
                  <>
                    {activeView === 'dashboard' && (
                      <button
                        type="button"
                        className="dashboard-reset-button"
                        onClick={resetDashboardLayout}
                        title="Reset dashboard layout"
                      >
                        Reset layout
                      </button>
                    )}

                    <div className="flex items-center overflow-hidden rounded-[2px] border border-[color:var(--border)]">
                      <button
                        type="button"
                        className="view-toggle"
                        data-active={listMode === 'table'}
                        onClick={() => setListMode('table')}
                      >
                        Table
                      </button>
                      <button
                        type="button"
                        className="view-toggle"
                        data-active={listMode === 'cards'}
                        onClick={() => setListMode('cards')}
                      >
                        Cards
                      </button>
                    </div>

                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => setActiveView('new-ticket')}
                    >
                      <Plus className="h-4 w-4" />
                      New
                    </button>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={exportVisibleTickets}
                    >
                      <Download className="h-4 w-4" />
                      Export
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <main className="flex-1 px-4 py-4 lg:px-6 lg:py-5">
            {activeView === 'dashboard' && (
              <div className="space-y-4">
                <ResponsiveDashboardGrid
                  className="dashboard-grid"
                  layouts={dashboardLayouts}
                  breakpoints={{ lg: 1280, md: 1024, sm: 640, xs: 0 }}
                  cols={{ lg: 10, md: 10, sm: 5, xs: 1 }}
                  rowHeight={52}
                  margin={[16, 16]}
                  containerPadding={[0, 0]}
                  draggableHandle=".dashboard-widget-handle"
                  isDraggable={!isMobileViewport}
                  isResizable={!isMobileViewport}
                  onLayoutChange={(_currentLayout: Layout, allLayouts: DashboardLayouts) => {
                    startTransition(() => {
                      setDashboardLayouts(mergeDashboardLayouts(allLayouts))
                    })
                  }}
                >
                  {([
                    'metric-total',
                    'metric-open',
                    'metric-progress',
                    'metric-pending',
                    'metric-critical',
                    'trends',
                    'status',
                    'queue',
                    'notes',
                  ] as DashboardWidgetId[]).map((widgetId) => (
                    <div key={widgetId} className="dashboard-widget-shell">
                      {renderDashboardWidget(widgetId)}
                    </div>
                  ))}
                </ResponsiveDashboardGrid>
              </div>
            )}

            {(activeView === 'unassigned' ||
              activeView === 'my-tickets' ||
              activeView === 'team-tickets') && renderTicketCollection()}

            {activeView === 'notifications' && renderNotificationsPage()}

            {activeView === 'settings' && currentUser.role === 'Admin' && renderAdminSettingsPage()}

            {activeView === 'new-ticket' && (
              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="surface p-4">
                  <div className="mb-4">
                    <div className="text-xl font-semibold">New Support Ticket</div>
                    <div className="text-sm text-[color:var(--text-muted)]">
                      Categories and assignees are restricted to {currentTeam.name}.
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="field">
                      <span className="field-label">Team</span>
                      <input className="input-control" value={currentTeam.name} disabled />
                    </label>
                    <label className="field">
                      <span className="field-label">Category</span>
                      <select
                        className="input-control"
                        value={newTicketForm.categoryId}
                        onChange={(event) =>
                          setNewTicketForm((current) => ({
                            ...current,
                            categoryId: event.target.value,
                          }))
                        }
                      >
                        {currentTeamCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field md:col-span-2">
                      <span className="field-label">Title</span>
                      <input
                        className="input-control"
                        value={newTicketForm.title}
                        onChange={(event) =>
                          setNewTicketForm((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                        placeholder="Describe the issue or request"
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Requestor</span>
                      <input
                        className="input-control"
                        value={newTicketForm.requestorName}
                        onChange={(event) =>
                          setNewTicketForm((current) => ({
                            ...current,
                            requestorName: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Requestor Email</span>
                      <input
                        className="input-control"
                        value={newTicketForm.requestorEmail}
                        onChange={(event) =>
                          setNewTicketForm((current) => ({
                            ...current,
                            requestorEmail: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Assigned To</span>
                      <select
                        className="input-control"
                        value={newTicketForm.assignedToId}
                        onChange={(event) =>
                          setNewTicketForm((current) => ({
                            ...current,
                            assignedToId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Unassigned</option>
                        {currentTeamMembers.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="field-label">Priority</span>
                      <select
                        className="input-control"
                        value={newTicketForm.priority}
                        onChange={(event) =>
                          setNewTicketForm((current) => ({
                            ...current,
                            priority: event.target.value as TicketPriority,
                          }))
                        }
                      >
                        {priorityOptions.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field md:col-span-2">
                      <span className="field-label">Location</span>
                      <input
                        className="input-control"
                        value={newTicketForm.location}
                        onChange={(event) =>
                          setNewTicketForm((current) => ({
                            ...current,
                            location: event.target.value,
                          }))
                        }
                        placeholder="Building, room, or remote"
                      />
                    </label>
                    <label className="field md:col-span-2">
                      <span className="field-label">Description</span>
                      <textarea
                        className="input-control min-h-36"
                        value={newTicketForm.description}
                        onChange={(event) =>
                          setNewTicketForm((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-3">
                    {createTicketError && (
                      <div className="rounded-[2px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {createTicketError}
                      </div>
                    )}
                    <button
                      type="button"
                      className="primary-button"
                      onClick={createTicket}
                      disabled={createTicketPending}
                    >
                      <Plus className="h-4 w-4" />
                      {createTicketPending ? 'Creating...' : 'Create Ticket'}
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="surface p-4">
                    <div className="mb-3 text-xl font-semibold">Team Controls</div>
                    <div className="space-y-3 text-sm text-[color:var(--text-muted)]">
                      <div className="surface-muted p-3">
                        Staff can only choose categories tied to {currentTeam.name}.
                      </div>
                      <div className="surface-muted p-3">
                        Staff reassignment is limited to {currentTeamMembers.length} people in the current team roster.
                      </div>
                      <div className="surface-muted p-3">
                        Logged in as <span className="font-semibold text-[color:var(--text)]">{currentUser.name}</span> with <span className="font-semibold text-[color:var(--text)]">{currentUser.role}</span> permissions.
                      </div>
                    </div>
                  </div>

                  <div className="surface p-4">
                    <div className="mb-3 text-xl font-semibold">Available Categories</div>
                    <div className="space-y-2">
                      {currentTeamCategories.map((category) => (
                        <div key={category.id} className="surface-muted p-3 text-sm">
                          <div className="font-semibold text-[color:var(--text)]">{category.name}</div>
                          <div className="text-[color:var(--text-muted)]">{category.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      <AnimatePresence>
        {selectedTicket && detailDraft && (
          <>
            {!detailPinned && (
              <motion.button
                type="button"
                aria-label="Close details panel"
                className="fixed inset-0 z-30 bg-slate-950/35"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                onClick={closePanel}
              />
            )}

            <motion.aside
              className="detail-panel fixed right-0 top-0 z-40 h-screen border-l border-[color:var(--border)] bg-[color:var(--panel-bg)]"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
            >
              <div className="detail-panel-shell flex h-full flex-col">
                {!isMobileViewport && (
                  <div
                    className="detail-resize-handle"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      startDetailResize(event.clientX)
                    }}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize ticket panel"
                  />
                )}
                <div className="border-b border-[color:var(--border)] px-5 py-4">
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-[color:var(--accent)]">
                          {selectedTicket.id}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--panel-bg)] px-2 py-0.5 text-xs text-[color:var(--text-muted)]">
                          <Paperclip className="h-3.5 w-3.5" />
                          {selectedTicket.attachmentCount ?? 0}
                        </span>
                        <span className={getStatusBadgeClass(selectedTicket.status)}>
                          {selectedTicket.status}
                        </span>
                        <span className={getPriorityBadgeClass(selectedTicket.priority)}>
                          {selectedTicket.priority}
                        </span>
                      </div>
                      <h2 className="text-2xl font-semibold">{selectedTicket.title}</h2>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => setDetailPinned((current) => !current)}
                        title={detailPinned ? 'Unpin panel' : 'Pin panel'}
                      >
                        {detailPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                      </button>
                      <button type="button" className="icon-button" onClick={closePanel}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-6 border-b border-[color:var(--border)]">
                    {(['details', 'activity', 'attachments'] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        className="tab-link"
                        data-active={detailTab === tab}
                        onClick={() => setDetailTab(tab)}
                      >
                        {tab === 'details'
                          ? 'Details'
                          : tab === 'activity'
                            ? 'Activity'
                            : 'Attachments'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  {detailTab === 'details' ? (
                    <div className="grid gap-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="field">
                          <span className="field-label">Status</span>
                          <select
                            className="input-control"
                            value={detailDraft.status}
                            onChange={(event) =>
                              setDetailDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      status: event.target.value as TicketStatus,
                                    }
                                  : current,
                              )
                            }
                          >
                            {statusOptions.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span className="field-label">Priority</span>
                          <select
                            className="input-control"
                            value={detailDraft.priority}
                            onChange={(event) =>
                              setDetailDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      priority: event.target.value as TicketPriority,
                                    }
                                  : current,
                              )
                            }
                          >
                            {priorityOptions.map((priority) => (
                              <option key={priority} value={priority}>
                                {priority}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span className="field-label">Team</span>
                          <input
                            className="input-control"
                            value={getTeamById(selectedTicket.teamId)?.name ?? 'Unknown'}
                            disabled
                          />
                        </label>
                        <label className="field">
                          <span className="field-label">Category</span>
                          <select
                            className="input-control"
                            value={detailDraft.categoryId}
                            onChange={(event) =>
                              setDetailDraft((current) =>
                                current
                                  ? { ...current, categoryId: event.target.value }
                                  : current,
                              )
                            }
                          >
                            {currentTeamCategories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span className="field-label">Assigned To</span>
                          <select
                            className="input-control"
                            value={detailDraft.assignedToId}
                            onChange={(event) =>
                              setDetailDraft((current) =>
                                current
                                  ? { ...current, assignedToId: event.target.value }
                                  : current,
                              )
                            }
                          >
                            <option value="">Unassigned</option>
                            {currentTeamMembers.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span className="field-label">Location</span>
                          <input className="input-control" value={selectedTicket.location} disabled />
                        </label>
                        <label className="field md:col-span-2">
                          <span className="field-label">Title</span>
                          <input
                            className="input-control"
                            value={detailDraft.title}
                            onChange={(event) =>
                              setDetailDraft((current) =>
                                current
                                  ? { ...current, title: event.target.value }
                                  : current,
                              )
                            }
                          />
                        </label>
                        <label className="field">
                          <span className="field-label">Requester</span>
                          <input className="input-control" value={selectedTicket.requestorName} disabled />
                        </label>
                        <label className="field">
                          <span className="field-label">Req. Email</span>
                          <input className="input-control" value={selectedTicket.requestorEmail} disabled />
                        </label>
                        <label className="field md:col-span-2">
                          <span className="field-label">Description</span>
                          <textarea
                            className="input-control min-h-36"
                            value={detailDraft.description}
                            onChange={(event) =>
                              setDetailDraft((current) =>
                                current
                                  ? { ...current, description: event.target.value }
                                  : current,
                              )
                            }
                          />
                        </label>
                      </div>

                      <div className="flex items-center justify-between border-t border-[color:var(--border)] pt-4">
                        <div className="text-sm text-[color:var(--text-muted)]">
                          Last updated {formatDateTime(selectedTicket.updatedAt)}
                        </div>
                        <div className="flex items-center gap-3">
                          {detailSaveError && (
                            <div className="rounded-[2px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                              {detailSaveError}
                            </div>
                          )}
                          <button
                            type="button"
                            className="primary-button"
                            onClick={saveTicketChanges}
                            disabled={detailSavePending}
                          >
                            {detailSavePending ? 'Saving...' : 'Save changes'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : detailTab === 'activity' ? (
                    <div className="space-y-4">
                      <div className="surface-muted space-y-3 p-4">
                        <div>
                          <div className="text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                            Add Comment
                          </div>
                          <div className="text-sm text-[color:var(--text-muted)]">
                            Comments are added to the ticket activity feed.
                          </div>
                        </div>
                        <textarea
                          className="input-control min-h-28 resize-y"
                          placeholder="Add a comment for this ticket"
                          value={commentDraft}
                          onChange={(event) => setCommentDraft(event.target.value)}
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            className="primary-button"
                            onClick={addTicketComment}
                            disabled={!commentDraft.trim() || commentPending}
                          >
                            {commentPending ? 'Saving...' : 'Post Comment'}
                          </button>
                        </div>
                        {commentError && (
                          <div className="rounded-[2px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {commentError}
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        {[...selectedTicket.activity]
                          .sort(
                            (left, right) =>
                              new Date(right.at).getTime() - new Date(left.at).getTime(),
                          )
                          .map((entry) => (
                            <div key={entry.id} className="surface-muted p-4">
                              <div className="mb-1 flex items-center justify-between gap-3">
                                <div className="font-semibold text-[color:var(--text)]">
                                  {entry.actor}
                                </div>
                                <div className="text-xs uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
                                  {formatDateTime(entry.at)}
                                </div>
                              </div>
                              <div className="text-sm text-[color:var(--text-muted)]">
                                {entry.message}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="surface-muted space-y-3 p-4">
                        <div>
                          <div className="text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                            Upload Attachment
                          </div>
                          <div className="text-sm text-[color:var(--text-muted)]">
                            Files are stored directly in SQL Server for this implementation.
                          </div>
                        </div>
                        <input
                          ref={attachmentInputRef}
                          type="file"
                          className="hidden"
                          onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
                        />
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm text-[color:var(--text-muted)]">
                            {attachmentFile
                              ? `${attachmentFile.name} • ${formatFileSize(attachmentFile.size)}`
                              : 'Select a file up to 10 MB.'}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => attachmentInputRef.current?.click()}
                              disabled={attachmentUploadPending}
                            >
                              File upload
                            </button>
                            <button
                              type="button"
                              className="primary-button"
                              onClick={uploadAttachment}
                              disabled={attachmentUploadPending}
                            >
                              <FileUp className="h-4 w-4" />
                              {attachmentUploadPending ? 'Uploading...' : 'Upload'}
                            </button>
                          </div>
                        </div>
                        {attachmentsError && (
                          <div className="rounded-[2px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {attachmentsError}
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        {attachmentsLoading ? (
                          <div className="surface-muted p-4 text-sm text-[color:var(--text-muted)]">
                            Loading attachments...
                          </div>
                        ) : attachments.length === 0 ? (
                          <div className="surface-muted p-4 text-sm text-[color:var(--text-muted)]">
                            No attachments have been uploaded for this ticket.
                          </div>
                        ) : (
                          attachments.map((attachment) => (
                            <div key={attachment.id} className="surface-muted flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                              <div>
                                <div className="font-semibold text-[color:var(--text)]">{attachment.fileName}</div>
                                <div className="text-sm text-[color:var(--text-muted)]">
                                  {formatFileSize(attachment.fileSizeBytes)} • {attachment.contentType || 'application/octet-stream'}
                                </div>
                                <div className="text-xs uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
                                  Uploaded by {attachment.uploadedByName} on {formatDateTime(attachment.uploadedAt)}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => downloadAttachment(attachment)}
                                >
                                  <Download className="h-4 w-4" />
                                  Download
                                </button>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => removeAttachment(attachment.id)}
                                  disabled={attachmentDeletePendingId === attachment.id}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  {attachmentDeletePendingId === attachment.id ? 'Removing...' : 'Remove'}
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {changePasswordModal && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-slate-950/40"
            aria-label="Close dialog"
            onClick={() => setChangePasswordModal(null)}
          />
          <div
            role="dialog"
            aria-modal={true}
            aria-labelledby="change-pw-title"
            className="surface fixed left-1/2 top-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 p-6 shadow-[0_24px_64px_rgba(13,47,79,0.22)]"
          >
            <h2 id="change-pw-title" className="mb-1 text-base font-semibold text-[color:var(--text)]">
              Change Password
            </h2>
            <p className="mb-4 text-sm text-[color:var(--text-muted)]">
              Set a new password for <strong>{changePasswordModal.userName}</strong>.
            </p>
            {changePasswordError && (
              <div className="mb-3 rounded-[2px] border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {changePasswordError}
              </div>
            )}
            <input
              type="password"
              className="input-control mb-4 w-full"
              placeholder="New password (min. 8 characters)"
              value={changePasswordValue}
              onChange={(e) => setChangePasswordValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleChangePassword() }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setChangePasswordModal(null)}
                disabled={changePasswordPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleChangePassword()}
                disabled={changePasswordPending}
              >
                {changePasswordPending ? 'Saving...' : 'Update Password'}
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  )
}

export default App
