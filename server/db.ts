import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

import { serverConfig } from './config.js'

let db: Database.Database | null = null

export const hasDatabaseConfig = () => true

const resolveSqlitePath = () => {
  const configuredPath = serverConfig.db.sqlitePath.trim()
  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath)
  }

  if (serverConfig.isProduction) {
    return '/home/data/dev.sqlite3'
  }

  return path.resolve(process.cwd(), 'dev.sqlite3')
}

const ensureSqliteDirectory = (sqlitePath: string) => {
  const directory = path.dirname(sqlitePath)
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true })
  }
}

export const getDb = (): Database.Database => {
  if (!db) {
    const dbPath = resolveSqlitePath()
    ensureSqliteDirectory(dbPath)
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initializeSchema(db)
    if (isDatabaseEmpty(db)) {
      seedDatabase(db)
    }
  }
  return db
}

const isDatabaseEmpty = (database: Database.Database): boolean => {
  const row = database.prepare('SELECT COUNT(*) as count FROM Teams').get() as { count: number }
  return row.count === 0
}

const initializeSchema = (database: Database.Database) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS Teams (
      Id TEXT PRIMARY KEY,
      Name TEXT NOT NULL,
      Code TEXT NOT NULL,
      AccentColor TEXT NOT NULL DEFAULT '#0078d4',
      CreatedAt TEXT DEFAULT (datetime('now')),
      UpdatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS Categories (
      Id TEXT PRIMARY KEY,
      TeamId TEXT NOT NULL,
      Name TEXT NOT NULL,
      Description TEXT NOT NULL DEFAULT '',
      CreatedAt TEXT DEFAULT (datetime('now')),
      UpdatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (TeamId) REFERENCES Teams(Id)
    );

    CREATE TABLE IF NOT EXISTS Users (
      Id TEXT PRIMARY KEY,
      Name TEXT NOT NULL,
      DisplayName TEXT,
      Email TEXT NOT NULL,
      TeamId TEXT NOT NULL,
      Role TEXT NOT NULL DEFAULT 'Staff',
      CreatedAt TEXT DEFAULT (datetime('now')),
      UpdatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (TeamId) REFERENCES Teams(Id)
    );

    CREATE TABLE IF NOT EXISTS Tickets (
      Id TEXT PRIMARY KEY,
      Title TEXT NOT NULL,
      Description TEXT NOT NULL,
      Status TEXT NOT NULL DEFAULT 'Open',
      Priority TEXT NOT NULL DEFAULT 'Medium',
      TeamId TEXT NOT NULL,
      CategoryId TEXT NOT NULL,
      AssignedToId TEXT,
      RequestorName TEXT NOT NULL,
      RequestorEmail TEXT NOT NULL,
      Location TEXT NOT NULL DEFAULT 'Not specified',
      DueLabel TEXT NOT NULL DEFAULT 'New in queue',
      CreatedAt TEXT DEFAULT (datetime('now')),
      UpdatedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (TeamId) REFERENCES Teams(Id),
      FOREIGN KEY (CategoryId) REFERENCES Categories(Id)
    );

    CREATE TABLE IF NOT EXISTS TicketActivity (
      Id TEXT PRIMARY KEY,
      TicketId TEXT NOT NULL,
      Actor TEXT NOT NULL,
      Message TEXT NOT NULL,
      ActivityAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (TicketId) REFERENCES Tickets(Id)
    );

    CREATE TABLE IF NOT EXISTS TicketAttachments (
      Id TEXT PRIMARY KEY,
      TicketId TEXT NOT NULL,
      FileName TEXT NOT NULL,
      ContentType TEXT NOT NULL DEFAULT 'application/octet-stream',
      FileSizeBytes INTEGER NOT NULL DEFAULT 0,
      FileContent BLOB,
      UploadedByUserId TEXT NOT NULL,
      UploadedByName TEXT NOT NULL,
      UploadedAt TEXT DEFAULT (datetime('now')),
      IsDeleted INTEGER NOT NULL DEFAULT 0,
      DeletedAt TEXT,
      DeletedByUserId TEXT,
      FOREIGN KEY (TicketId) REFERENCES Tickets(Id)
    );

    CREATE TABLE IF NOT EXISTS TeamTicketTrends (
      TrendDate TEXT NOT NULL,
      TeamId TEXT NOT NULL,
      TicketCount INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (TrendDate, TeamId)
    );

    CREATE TABLE IF NOT EXISTS AppSettings (
      Key TEXT PRIMARY KEY,
      Value TEXT NOT NULL,
      UpdatedAt TEXT DEFAULT (datetime('now'))
    );
  `)
}

const seedDatabase = (database: Database.Database) => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

  database.exec('BEGIN TRANSACTION')

  try {
    // Teams
    const insertTeam = database.prepare('INSERT INTO Teams (Id, Name, Code, AccentColor) VALUES (?, ?, ?, ?)')
    insertTeam.run('it', 'IT Support', 'IT', '#0078d4')
    insertTeam.run('facilities', 'Facilities', 'FAC', '#2f9e44')
    insertTeam.run('hr', 'Human Resources', 'HR', '#e8590c')

    // Categories
    const insertCategory = database.prepare('INSERT INTO Categories (Id, TeamId, Name, Description) VALUES (?, ?, ?, ?)')
    insertCategory.run('cat-it-hardware', 'it', 'Hardware', 'Hardware issues and requests')
    insertCategory.run('cat-it-software', 'it', 'Software', 'Software installation and issues')
    insertCategory.run('cat-it-network', 'it', 'Network', 'Network and connectivity issues')
    insertCategory.run('cat-it-account', 'it', 'Account Access', 'Account and password issues')
    insertCategory.run('cat-fac-maintenance', 'facilities', 'Maintenance', 'Building maintenance requests')
    insertCategory.run('cat-fac-safety', 'facilities', 'Safety', 'Safety concerns and reports')
    insertCategory.run('cat-hr-onboarding', 'hr', 'Onboarding', 'New employee onboarding')
    insertCategory.run('cat-hr-benefits', 'hr', 'Benefits', 'Benefits questions and requests')

    // Users
    const insertUser = database.prepare('INSERT INTO Users (Id, Name, DisplayName, Email, TeamId, Role) VALUES (?, ?, ?, ?, ?, ?)')
    insertUser.run('u-kevin', 'Kevin Key', 'Kevin Key', 'kevin.key@company.com', 'it', 'Admin')
    insertUser.run('u-diana', 'Diana Park', 'Diana Park', 'diana.park@company.com', 'it', 'Staff')
    insertUser.run('u-alex', 'Alex Rivera', 'Alex Rivera', 'alex.rivera@company.com', 'it', 'Staff')
    insertUser.run('u-michael', 'Michael Chen', 'Michael Chen', 'michael.chen@company.com', 'facilities', 'Staff')
    insertUser.run('u-sarah', 'Sarah Johnson', 'Sarah Johnson', 'sarah.johnson@company.com', 'facilities', 'Admin')
    insertUser.run('u-emily', 'Emily Davis', 'Emily Davis', 'emily.davis@company.com', 'hr', 'Staff')

    // Tickets
    const insertTicket = database.prepare(`
      INSERT INTO Tickets (Id, Title, Description, Status, Priority, TeamId, CategoryId, AssignedToId, RequestorName, RequestorEmail, Location, DueLabel, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insertTicket.run('TKT-10001', 'Laptop not booting', 'My laptop shows a black screen after the login prompt. Tried restarting multiple times.', 'Open', 'High', 'it', 'cat-it-hardware', 'u-diana', 'James Wilson', 'james.wilson@company.com', 'Building A, Room 204', 'Today', daysAgo(0), daysAgo(0))
    insertTicket.run('TKT-10002', 'Install Adobe Creative Suite', 'Need Adobe Creative Suite installed for the marketing project starting next week.', 'In Progress', 'Medium', 'it', 'cat-it-software', 'u-alex', 'Maria Garcia', 'maria.garcia@company.com', 'Building B, Room 110', 'This week', daysAgo(2), daysAgo(1))
    insertTicket.run('TKT-10003', 'VPN connection drops frequently', 'Remote VPN disconnects every 15-20 minutes. Using Cisco AnyConnect on Windows 11.', 'Open', 'High', 'it', 'cat-it-network', 'u-kevin', 'Tom Anderson', 'tom.anderson@company.com', 'Remote', 'Today', daysAgo(1), daysAgo(0))
    insertTicket.run('TKT-10004', 'Password reset for ERP system', 'Locked out of the ERP system after too many failed attempts. Need urgent password reset.', 'Resolved', 'Critical', 'it', 'cat-it-account', 'u-diana', 'Lisa Brown', 'lisa.brown@company.com', 'Building A, Room 312', 'Completed', daysAgo(3), daysAgo(2))
    insertTicket.run('TKT-10005', 'New monitor request', 'Need an additional 27-inch monitor for dual-screen setup. Approved by manager.', 'Pending', 'Low', 'it', 'cat-it-hardware', null, 'Robert Taylor', 'robert.taylor@company.com', 'Building C, Room 501', 'Next week', daysAgo(5), daysAgo(3))
    insertTicket.run('TKT-10006', 'Broken window in conference room', 'Large crack in the window of conference room 3B. Potential safety hazard.', 'Open', 'High', 'facilities', 'cat-fac-safety', 'u-michael', 'Anna Lee', 'anna.lee@company.com', 'Building A, Conference Room 3B', 'Today', daysAgo(0), daysAgo(0))
    insertTicket.run('TKT-10007', 'HVAC not working in east wing', 'Temperature is too high in the east wing offices. AC appears to be off.', 'In Progress', 'Medium', 'facilities', 'cat-fac-maintenance', 'u-sarah', 'David Kim', 'david.kim@company.com', 'Building B, East Wing', 'This week', daysAgo(1), daysAgo(0))
    insertTicket.run('TKT-10008', 'New hire onboarding - Jane Smith', 'Jane Smith starts Monday. Need workstation setup, badge, and system access.', 'Open', 'High', 'hr', 'cat-hr-onboarding', 'u-emily', 'Mark Thompson', 'mark.thompson@company.com', 'Building A, HR Office', 'This week', daysAgo(2), daysAgo(1))
    insertTicket.run('TKT-10009', 'Printer paper jam on 3rd floor', 'The HP LaserJet on the 3rd floor keeps jamming. Already tried clearing it.', 'Closed', 'Low', 'it', 'cat-it-hardware', 'u-alex', 'Chris Martin', 'chris.martin@company.com', 'Building A, 3rd Floor', 'Completed', daysAgo(7), daysAgo(5))
    insertTicket.run('TKT-10010', 'Benefits enrollment question', 'Need help understanding the dental plan options for open enrollment.', 'Pending', 'Low', 'hr', 'cat-hr-benefits', 'u-emily', 'Rachel Green', 'rachel.green@company.com', 'Remote', 'Next week', daysAgo(3), daysAgo(2))

    // Ticket Activity
    const insertActivity = database.prepare('INSERT INTO TicketActivity (Id, TicketId, Actor, Message, ActivityAt) VALUES (?, ?, ?, ?, ?)')
    insertActivity.run('act-1', 'TKT-10001', 'System', 'Ticket created from TeamSupportPro.', daysAgo(0))
    insertActivity.run('act-2', 'TKT-10002', 'System', 'Ticket created from TeamSupportPro.', daysAgo(2))
    insertActivity.run('act-3', 'TKT-10002', 'Alex Rivera', 'Changed status from Open to In Progress.', daysAgo(1))
    insertActivity.run('act-4', 'TKT-10002', 'Alex Rivera', 'Started downloading installer from Adobe admin console.', daysAgo(1))
    insertActivity.run('act-5', 'TKT-10003', 'System', 'Ticket created from TeamSupportPro.', daysAgo(1))
    insertActivity.run('act-6', 'TKT-10004', 'System', 'Ticket created from TeamSupportPro.', daysAgo(3))
    insertActivity.run('act-7', 'TKT-10004', 'Diana Park', 'Changed status from Open to In Progress.', daysAgo(3))
    insertActivity.run('act-8', 'TKT-10004', 'Diana Park', 'Password reset completed. User notified via email.', daysAgo(2))
    insertActivity.run('act-9', 'TKT-10004', 'Diana Park', 'Changed status from In Progress to Resolved.', daysAgo(2))
    insertActivity.run('act-10', 'TKT-10005', 'System', 'Ticket created from TeamSupportPro.', daysAgo(5))
    insertActivity.run('act-11', 'TKT-10005', 'Kevin Key', 'Changed status from Open to Pending.', daysAgo(3))
    insertActivity.run('act-12', 'TKT-10005', 'Kevin Key', 'Waiting for equipment procurement approval.', daysAgo(3))
    insertActivity.run('act-13', 'TKT-10006', 'System', 'Ticket created from TeamSupportPro.', daysAgo(0))
    insertActivity.run('act-14', 'TKT-10007', 'System', 'Ticket created from TeamSupportPro.', daysAgo(1))
    insertActivity.run('act-15', 'TKT-10007', 'Sarah Johnson', 'Changed status from Open to In Progress.', daysAgo(0))
    insertActivity.run('act-16', 'TKT-10007', 'Sarah Johnson', 'HVAC technician dispatched. ETA 2 hours.', daysAgo(0))
    insertActivity.run('act-17', 'TKT-10008', 'System', 'Ticket created from TeamSupportPro.', daysAgo(2))
    insertActivity.run('act-18', 'TKT-10009', 'System', 'Ticket created from TeamSupportPro.', daysAgo(7))
    insertActivity.run('act-19', 'TKT-10009', 'Alex Rivera', 'Cleared paper jam and replaced rollers.', daysAgo(5))
    insertActivity.run('act-20', 'TKT-10009', 'Alex Rivera', 'Changed status from Open to Closed.', daysAgo(5))
    insertActivity.run('act-21', 'TKT-10010', 'System', 'Ticket created from TeamSupportPro.', daysAgo(3))

    // Trends
    const insertTrend = database.prepare('INSERT INTO TeamTicketTrends (TrendDate, TeamId, TicketCount) VALUES (?, ?, ?)')
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0]
      insertTrend.run(d, 'it', Math.floor(Math.random() * 5) + 2)
      insertTrend.run(d, 'facilities', Math.floor(Math.random() * 3) + 1)
      insertTrend.run(d, 'hr', Math.floor(Math.random() * 2) + 1)
    }

    database.exec('COMMIT')
    console.log('SQLite database seeded with mock data.')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}