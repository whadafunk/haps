import { FastifyPluginAsync } from 'fastify'
import { getLocalFileStream, detectMimeType } from '../services/storage.js'
import { createError } from '../lib/errors.js'
import { createReadStream } from 'fs'
import { join } from 'path'
import { config } from '../lib/config.js'
import { existsSync } from 'fs'

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

const uploadsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/uploads/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string }

    // Block path traversal
    if (filename.includes('/') || filename.includes('..') || filename.includes('\0')) {
      throw createError(400, 'INVALID_FILENAME', 'Invalid filename.')
    }

    const stream = getLocalFileStream(filename)
    if (!stream) throw createError(404, 'NOT_FOUND', 'File not found.')

    const ext = filename.split('.').pop()?.toLowerCase() ?? ''
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'

    reply.header('Content-Type', contentType)
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Cache-Control', 'public, max-age=31536000, immutable')

    return reply.send(stream)
  })
}

export default uploadsRoutes
