import { NextResponse, type NextRequest } from "next/server";

// Middleware 100% síncrono — zero chamadas de rede.
// Evita MIDDLEWARE_INVOCATION_TIMEOUT no Vercel edge.
// Validação real do token (getUser) acontece nos Server Components/layouts.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Motoboy por cookie de dispositivo (definido no login — sem rede)
  const mbDevice = request.cookies.get("vellox_mb_device")?.value;
  if (mbDevice === "1" && !pathname.startsWith("/motoboy")) {
    return NextResponse.redirect(new URL("/motoboy", request.url));
  }

  // Verifica presença do cookie de sessão Supabase (apenas leitura local)
  // Formato: sb-<project-ref>-auth-token
  const hasSession = request.cookies.getAll().some(
    c => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"),
  );

  const protectedPrefixes = [
    "/dashboard", "/motoboys", "/pedidos", "/configuracoes",
    "/mapa", "/monitor", "/financeiro", "/catalogo",
  ];

  if (protectedPrefixes.some(p => pathname.startsWith(p)) && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Exclui: estáticos, imagens, API routes e internos do Next.js
    "/((?!_next/static|_next/image|favicon.ico|icon.*|sw.js|manifest.json|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
