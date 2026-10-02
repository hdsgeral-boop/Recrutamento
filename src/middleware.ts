import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, lerSessao } from "@/lib/auth";
import { pode, podeEntrarNasEntrevistas } from "@/lib/permissoes";
import {
  extrairSlugDoHost,
  SLUG_PADRAO,
  CABECALHO_CONCURSO_SLUG,
  COOKIE_CONCURSO_ACTIVO,
} from "@/lib/concurso-contexto";

/**
 * Middleware central da plataforma multi-concurso:
 * 1. Resolve o concurso através do subdomínio (ou parâmetro ?concurso= em dev, ou cookie no admin).
 * 2. Injeciona o x-concurso-slug nos cabeçalhos para os Server Components.
 * 3. Protege tudo o que está sob /admin com validação de sessão e papéis.
 */
export async function middleware(pedido: NextRequest) {
  const { pathname, search, searchParams } = pedido.nextUrl;

  // 1. Resolução do Concurso:
  // Subdomínio de produção (*.recrutar.co.ao), preview vercel, query param, ou cookie de concurso activo.
  const host = pedido.headers.get("host");
  const slugDoHost = extrairSlugDoHost(host);
  const slugDoParam = searchParams.get("concurso");
  const slugDoCookie = pedido.cookies.get(COOKIE_CONCURSO_ACTIVO)?.value;
  const slugConcurso = slugDoHost || slugDoParam || (pathname.startsWith("/admin") && slugDoCookie) || SLUG_PADRAO;

  // Prepara os cabeçalhos enriquecidos para o resto da aplicação
  const pedidoHeaders = new Headers(pedido.headers);
  pedidoHeaders.set(CABECALHO_CONCURSO_SLUG, slugConcurso);

  // 2. Rotas públicas: passam com os cabeçalhos do concurso
  if (!pathname.startsWith("/admin") && !pathname.startsWith("/api/admin")) {
    return NextResponse.next({
      request: {
        headers: pedidoHeaders,
      },
    });
  }

  // 3. Área Administrativa:
  // A página de login e a acção de autenticação têm de ficar abertas.
  if (pathname === "/admin/login") {
    return NextResponse.next({
      request: {
        headers: pedidoHeaders,
      },
    });
  }

  const sessao = await lerSessao(pedido.cookies.get(COOKIE_SESSAO)?.value);

  if (sessao) {
    // Enquanto a palavra-passe for a que o sistema gerou, o painel inteiro
    // está fechado: só se pode trocá-la ou sair.
    if (sessao.deveTrocar && pathname !== "/admin/trocar-palavra-passe") {
      const destino = pedido.nextUrl.clone();
      destino.pathname = "/admin/trocar-palavra-passe";
      destino.search = "";
      return NextResponse.redirect(destino);
    }

    // Validação de capacidades por secção
    const barrada =
      (pathname.startsWith("/admin/utilizadores") && !pode(sessao.papel, "gerir_utilizadores")) ||
      (pathname.startsWith("/admin/definicoes") && !pode(sessao.papel, "configurar")) ||
      (pathname.startsWith("/admin/entrevistas") &&
        !podeEntrarNasEntrevistas(sessao.papel, sessao.eRecrutador)) ||
      ((pathname.startsWith("/admin/entrevistas/atribuicao") ||
        pathname.startsWith("/admin/entrevistas/perguntas")) &&
        !pode(sessao.papel, "gerir_entrevistas"));

    if (barrada) {
      const destino = pedido.nextUrl.clone();
      destino.pathname = "/admin";
      destino.search = "?semPermissao=1";
      return NextResponse.redirect(destino);
    }

    return NextResponse.next({
      request: {
        headers: pedidoHeaders,
      },
    });
  }

  const destino = pedido.nextUrl.clone();
  destino.pathname = "/admin/login";
  destino.search = `?voltar=${encodeURIComponent(pathname + search)}`;

  return NextResponse.redirect(destino);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
