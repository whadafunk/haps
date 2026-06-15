import { randomBytes, timingSafeEqual, createHash } from 'crypto'

export function sha256hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}
import argon2 from 'argon2'

export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

export async function hashToken(token: string): Promise<string> {
  return argon2.hash(token, { type: argon2.argon2id })
}

export async function verifyToken(hash: string, token: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, token)
  } catch {
    return false
  }
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id })
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}
