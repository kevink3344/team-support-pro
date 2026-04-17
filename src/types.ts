export type TeamId = string
export type UserId = string
export type CategoryId = string
export type TicketId = string

export type TicketStatus =
  | 'Open'
  | 'In Progress'
  | 'Pending'
  | 'Resolved'
  | 'Closed'

export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Critical'

export type AppView =
  | 'dashboard'
  | 'notifications'
  | 'unassigned'
  | 'my-tickets'
  | 'team-tickets'
  | 'new-ticket'
  | 'settings'

export type ListViewMode = 'table' | 'cards'
export type ThemeMode = 'light' | 'dark'

export interface Team {
  id: TeamId
  name: string
  code: string
  accent: string
}

export interface Category {
  id: CategoryId
  teamId: TeamId
  name: string
  description: string
}

export interface User {
  id: UserId
  name: string
  email: string
  teamId: TeamId
  role: 'Admin' | 'Staff'
}

export interface AuthSession {
  id?: string
  subject: string
  name: string
  email: string
  role?: 'Admin' | 'Staff'
  teamId?: string
  picture?: string
}

export interface AuthenticatedUser extends User {
  teamName?: string
  teamCode?: string
  teamAccent?: string
  picture?: string
}

export interface ActivityEntry {
  id: string
  actor: string
  message: string
  at: string
}

export interface TicketAttachment {
  id: string
  ticketId: string
  fileName: string
  contentType: string
  fileSizeBytes: number
  uploadedByUserId: string
  uploadedByName: string
  uploadedAt: string
}

export interface Ticket {
  id: TicketId
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  teamId: TeamId
  categoryId: CategoryId
  attachmentCount?: number
  assignedToId: UserId | null
  requestorName: string
  requestorEmail: string
  location: string
  dueLabel: string
  createdAt: string
  updatedAt: string
  activity: ActivityEntry[]
}

export interface TrendPoint {
  date: string
  values: Record<string, number>
}

export interface ThemePalette {
  appBg: string
  headerBg: string
  menuBg: string
  cardBg: string
  panelBg: string
  inputBg: string
  buttonBg: string
  accent: string
  text: string
  textMuted: string
  border: string
  buttonText: string
}

export interface ThemeConfig {
  light: ThemePalette
  dark: ThemePalette
}
