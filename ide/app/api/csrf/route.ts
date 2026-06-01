import { NextRequest } from 'next/server';
import { csrfTokenResponse } from '@/lib/csrf';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  return csrfTokenResponse();
}