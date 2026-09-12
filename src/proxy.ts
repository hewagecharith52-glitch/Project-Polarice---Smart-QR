import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect these staff/admin routes
  const isProtected =
    pathname.startsWith('/cashier') ||
    pathname.startsWith('/kitchen') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/analytics');

  if (isProtected) {
    // Check for our secure auth token cookie
    const hasAuthCookie = request.cookies.has('auth_token');

    if (!hasAuthCookie) {
      // If unauthenticated, immediately redirect to login and preserve intended destination
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/cashier/:path*',
    '/kitchen/:path*',
    '/admin/:path*',
    '/analytics/:path*'
  ]
};
