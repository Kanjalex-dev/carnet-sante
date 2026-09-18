import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Garde d'acces. Le middleware Next tourne sur le runtime Edge : pas d'acces a
 * Prisma ni au module `node:crypto`. On se limite donc a verifier la signature
 * du cookie ; toute logique qui touche la base se fait dans les routes.
 */

const PUBLIC_PATHS = [
  '/login',
  '/setup',
  '/manifest.webmanifest',
  '/sw.js',
  '/offline',
  '/icons',
  '/api/auth',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = request.cookies.get('patrimo_session')?.value;
  if (token) {
    try {
      const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? '');
      await jwtVerify(token, secret, { algorithms: ['HS256'] });
      return NextResponse.next();
    } catch {
      // Cookie expire ou falsifie : on retombe sur la redirection.
    }
  }

  // Une requete d'API doit recevoir un 401, pas une redirection HTML.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};
