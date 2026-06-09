import { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { AppError } from '../lib/errors.js'

export function errorHandler(error: FastifyError | AppError | ZodError, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data.',
        details: error.flatten().fieldErrors,
      },
    })
  }

  const statusCode = (error as AppError).statusCode ?? (error as FastifyError).statusCode ?? 500
  const code = (error as AppError).code ?? (error as FastifyError).code ?? 'INTERNAL_ERROR'
  const details = (error as AppError).details ?? {}

  if (statusCode >= 500) {
    request.log.error({ err: error }, 'Internal server error')
  }

  reply.code(statusCode).send({
    error: {
      code,
      message: statusCode >= 500 ? 'An unexpected error occurred.' : error.message,
      details,
    },
  })
}
