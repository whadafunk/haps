import { createWriteStream, createReadStream, existsSync } from 'fs'
import { mkdir, unlink } from 'fs/promises'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import type { Readable } from 'stream'
import { config } from '../lib/config.js'

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export function detectMimeType(buffer: Buffer): string | null {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return 'image/gif'
  // WebP: RIFF....WEBP
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'image/webp'
  return null
}

export function getAllowedExtension(mimeType: string): string | null {
  return ALLOWED_MIME_TYPES[mimeType] ?? null
}

export async function saveLocalFile(stream: Readable, filename: string): Promise<string> {
  await mkdir(config.STORAGE_PATH, { recursive: true })
  const dest = join(config.STORAGE_PATH, filename)
  await pipeline(stream, createWriteStream(dest))
  return `${config.APP_URL}/api/uploads/${filename}`
}

export function getLocalFileStream(filename: string): Readable | null {
  const filePath = join(config.STORAGE_PATH, filename)
  if (!existsSync(filePath)) return null
  return createReadStream(filePath)
}

// Extracts the filename from a stored URL and deletes the file.
// Silently ignores missing files — idempotent for already-cleaned paths.
export async function deleteLocalFile(url: string): Promise<void> {
  const prefix = `${config.APP_URL}/api/uploads/`
  if (!url.startsWith(prefix)) return
  const filename = url.slice(prefix.length)
  const filePath = join(config.STORAGE_PATH, filename)
  await unlink(filePath).catch(() => {})
}
