import { randomBytes, createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const CSRF_SECRET = process.env.CSRF_SECRET ?? 'change-this-secret-in-production';
const CSRF_TOKEN_HEADER = 'x-csrf-token';
const CSRF_COOKIE_NAME = '__Host-csrf';
const TOKEN_BYTE_LENGTH = 32;
const TOKEN_TTL_MS = 60 * 60 * 1000;

export function generateCsrfToken(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(TOKEN_BYTE_LENGTH).toString('hex');
  const payload = `${timestamp}.${random}`;
  const sig = createHmac('sha256', CSRF_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

export function verifyCsrfToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split('.');
    if (parts.length !== 3) return false;

    const [timestamp, random, sig] = parts;
    const payload = `${timestamp}.${random}`;
    const expectedSig = createHmac('sha256', CSRF_SECRET).update(payload).digest('hex');

    if (!timingSafeEqual(sig, expectedSig)) return false;

    const tokenAge = Date.now() - parseInt(timestamp, 36);
    if (tokenAge > TOKEN_TTL_MS) return false;

    return true;
  } catch {
    return false;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function csrfGuard(req: NextRequest): NextResponse | null {
  const method = req.method?.toUpperCase();

  if (!method || ['GET', 'HEAD', 'OPTIONS'].includes(method)) return null;

  const token =
    req.headers.get(CSRF_TOKEN_HEADER) ??
    req.cookies.get(CSRF_COOKIE_NAME)?.value ??
    null;

  if (!token || !verifyCsrfToken(token)) {
    return new NextResponse(
      JSON.stringify({ error: 'Invalid or missing CSRF token' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  return null;
}

export function buildSecureSessionCookie(name: string, value: string, maxAgeSeconds = 3600): string {
  return [
    `${name}=${value}`,
    `Max-Age=${maxAgeSeconds}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
}

export function csrfTokenResponse(): NextResponse {
  const token = generateCsrfToken();
  const res = NextResponse.json({ csrfToken: token });
  res.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 3600,
  });
  return res;
}