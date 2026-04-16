import crypto from 'node:crypto'

import { getDb } from './db.js'

export interface TicketAttachmentRecord {
  id: string
  ticketId: string
  fileName: string
  contentType: string
  fileSizeBytes: number
  uploadedByUserId: string
  uploadedByName: string
  uploadedAt: string
}

export interface TicketAttachmentBlobRecord extends TicketAttachmentRecord {
  fileContent: Buffer
}

interface CreateAttachmentInput {
  ticketId: string
  fileName: string
  contentType: string
  fileSizeBytes: number
  fileContent: Buffer
  uploadedByUserId: string
  uploadedByName: string
}

const mapAttachmentRecord = (record: Record<string, unknown>): TicketAttachmentRecord => ({
  id: String(record.id),
  ticketId: String(record.ticketId),
  fileName: String(record.fileName),
  contentType: String(record.contentType),
  fileSizeBytes: Number(record.fileSizeBytes),
  uploadedByUserId: String(record.uploadedByUserId),
  uploadedByName: String(record.uploadedByName),
  uploadedAt: new Date(String(record.uploadedAt)).toISOString(),
})

const mapAttachmentBlobRecord = (record: Record<string, unknown>): TicketAttachmentBlobRecord => ({
  ...mapAttachmentRecord(record),
  fileContent: Buffer.from(record.fileContent as Buffer),
})

export const listTicketAttachments = async (ticketId: string): Promise<TicketAttachmentRecord[]> => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT Id AS id, TicketId AS ticketId, FileName AS fileName, ContentType AS contentType,
      FileSizeBytes AS fileSizeBytes, UploadedByUserId AS uploadedByUserId,
      UploadedByName AS uploadedByName, UploadedAt AS uploadedAt
    FROM TicketAttachments WHERE TicketId = ? AND IsDeleted = 0 ORDER BY UploadedAt DESC
  `).all(ticketId) as Record<string, unknown>[]
  return rows.map(mapAttachmentRecord)
}

export const getTicketAttachmentById = async (
  ticketId: string,
  attachmentId: string,
): Promise<TicketAttachmentBlobRecord | null> => {
  const db = getDb()
  const row = db.prepare(`
    SELECT Id AS id, TicketId AS ticketId, FileName AS fileName, ContentType AS contentType,
      FileSizeBytes AS fileSizeBytes, FileContent AS fileContent,
      UploadedByUserId AS uploadedByUserId, UploadedByName AS uploadedByName, UploadedAt AS uploadedAt
    FROM TicketAttachments WHERE TicketId = ? AND Id = ? AND IsDeleted = 0
  `).get(ticketId, attachmentId) as Record<string, unknown> | undefined
  return row ? mapAttachmentBlobRecord(row) : null
}

export const createTicketAttachment = async (input: CreateAttachmentInput): Promise<TicketAttachmentRecord | null> => {
  if (!input.fileContent.length || !input.fileName.trim()) return null
  const db = getDb()
  const attachmentId = `att-${crypto.randomUUID()}`
  const uploadedAt = new Date().toISOString()

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO TicketAttachments (Id, TicketId, FileName, ContentType, FileSizeBytes, FileContent, UploadedByUserId, UploadedByName, UploadedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(attachmentId, input.ticketId, input.fileName.trim(), input.contentType || 'application/octet-stream', input.fileSizeBytes, input.fileContent, input.uploadedByUserId, input.uploadedByName, uploadedAt)

    db.prepare('UPDATE Tickets SET UpdatedAt = ? WHERE Id = ?').run(uploadedAt, input.ticketId)

    db.prepare('INSERT INTO TicketActivity (Id, TicketId, Actor, Message, ActivityAt) VALUES (?, ?, ?, ?, ?)').run(
      `attachment-${crypto.randomUUID()}`, input.ticketId, input.uploadedByName,
      `Uploaded attachment: ${input.fileName.trim()}.`, uploadedAt,
    )
  })
  tx()

  const created = await getTicketAttachmentById(input.ticketId, attachmentId)
  if (!created) return null
  const { fileContent: _fileContent, ...metadata } = created
  return metadata
}

export const deleteTicketAttachment = async (
  ticketId: string,
  attachmentId: string,
  deletedByUserId: string,
  deletedByName: string,
): Promise<boolean> => {
  const existing = await getTicketAttachmentById(ticketId, attachmentId)
  if (!existing) return false

  const db = getDb()
  const deletedAt = new Date().toISOString()

  const tx = db.transaction(() => {
    const result = db.prepare('UPDATE TicketAttachments SET IsDeleted = 1, DeletedAt = ?, DeletedByUserId = ? WHERE TicketId = ? AND Id = ? AND IsDeleted = 0').run(deletedAt, deletedByUserId, ticketId, attachmentId)
    if (result.changes === 0) return false

    db.prepare('UPDATE Tickets SET UpdatedAt = ? WHERE Id = ?').run(deletedAt, ticketId)
    db.prepare('INSERT INTO TicketActivity (Id, TicketId, Actor, Message, ActivityAt) VALUES (?, ?, ?, ?, ?)').run(
      `attachment-${crypto.randomUUID()}`, ticketId, deletedByName,
      `Removed attachment: ${existing.fileName}.`, deletedAt,
    )
    return true
  })

  return tx() as boolean
}
