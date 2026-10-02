import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const TOKEN_EXPIRY = '7d'

interface TokenPayload {
  userId: string
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is required')
  return secret
}

export function signToken(userId: string): string {
  return jwt.sign({ userId }, jwtSecret(), { expiresIn: TOKEN_EXPIRY })
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, jwtSecret()) as TokenPayload
    return decoded
  } catch {
    return null
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
