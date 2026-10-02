import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { dataHora } from "@/lib/datas";
import { EMPRESA } from "@/lib/constantes";
import type { Candidato } from "@/types/database";

/**
 * ===========================================================================
 * GET /api/admin/exportar  →  ficheiro .xlsx
 * ---------------------------------------------------------------------------
 * Exporta as candidaturas respeitando os mesmos filtros do painel.
 * Protegido pelo middleware (só entra com sessão válida).
 * ===========================================================================
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const simNao = (v: boolean) => (v ? "Sim" : "Não");

const booleanoDoFiltro = (valor: string | null): boolean | null =>
  valor === "sim" ? true : valor === "nao" ? false : null;

export async function GET(pedido: NextRequest) {
  // Este ficheiro leva BI, telefone e email de toda a gente. Só quem tem a
  // permissão de exportar o pode descarregar.
  const { podeNaSessao } = await import("@/lib/utilizadores");
  if (!(await podeNaSessao("exportar"))) {
    return new Response("Não tens permissão para exportar os dados.", { status: 403 });
  }

  try {
    const p = pedido.nextUrl.searchParams;
    const supabase = criarClienteServidor();

    // ---------------------------------------------------------- CONSULTA
    let consulta = supabase.from("candidatos").select("*").order("created_at", { ascending: false });

    const concursoId = p.get("concurso_id");
    if (concursoId) consulta = consulta.eq("concurso_id", concursoId);

    const provincia = p.get("provincia");
    if (provincia) consulta = consulta.eq("provincia", provincia);

    const municipio = p.get("municipio");
    if (municipio) consulta = consulta.eq("municipio", municipio);

    const status = p.get("status");
    if (status) consulta = consulta.eq("status", status);

    const carta = booleanoDoFiltro(p.get("carta"));
    if (carta !== null) consulta = consulta.eq("tem_carta", carta);

    const mtbt = booleanoDoFiltro(p.get("mtbt"));
    if (mtbt !== null) consulta = consulta.eq("conhece_mtbt", mtbt);

    const experiencia = booleanoDoFiltro(p.get("experiencia"));
    if (experiencia !== null) consulta = consulta.eq("experiencia_similar", experiencia);

    const q = p.get("q");
    if (q) {
      const termo = q.replace(/[,()]/g, " ").trim();
      if (termo) {
        consulta = consulta.or(
          `nome.ilike.%${termo}%,bi.ilike.%${termo}%,email.ilike.%${termo}%,telefone.ilike.%${termo}%`
        );
      }
    }

    const { data, error } = await consulta.limit(5000);
    if (error) throw new Error(error.message);

    const candidatos = (data ?? []) as Candidato[];

    // Pontuações da rubrica, quando existirem. A exportação nunca falha por
    // causa delas: se a migração do ranking ainda não correu, ficam vazias.
    const pontuacoes = new Map<string, Record<string, unknown>>();
    try {
      const { carregarAnalises } = await import("@/lib/ranking/carregar");
      const { porCandidato } = await carregarAnalises();
      for (const [id, a] of porCandidato) {
        pontuacoes.set(id, a as unknown as Record<string, unknown>);
      }
    } catch {
      /* ranking por instalar */
    }

    // ------------------------------------------------------------ LIVRO
    const livro = new ExcelJS.Workbook();
    livro.creator = EMPRESA.nome;
    livro.created = new Date();

    const folha = livro.addWorksheet("Candidaturas", {
      views: [{ state: "frozen", ySplit: 1 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    folha.columns = [
      { header: "Referência", key: "ref", width: 12 },
      { header: "Data da candidatura", key: "data", width: 20 },
      { header: "Nome completo", key: "nome", width: 32 },
      { header: "Nº BI", key: "bi", width: 18 },
      { header: "Província", key: "provincia", width: 12 },
      { header: "Município", key: "municipio", width: 16 },
      { header: "Telefone", key: "telefone", width: 16 },
      { header: "Email", key: "email", width: 30 },
      { header: "Nível académico", key: "nivel", width: 28 },
      { header: "Curso", key: "curso", width: 24 },
      { header: "MT/BT", key: "mtbt", width: 8 },
      { header: "Carta", key: "carta", width: 8 },
      { header: "Experiência", key: "exp", width: 12 },
      { header: "Comprovativo exp.", key: "expdoc", width: 16 },
      { header: "Condições aceites", key: "condicoes", width: 16 },
      { header: "Estado", key: "status", width: 13 },
      { header: "Observações", key: "obs", width: 40 },
      { header: "Documentos", key: "docs", width: 14 },
      { header: "Ficha no painel", key: "ficha", width: 16 },
      { header: "Pasta no Drive", key: "drive", width: 16 },
      { header: "Arquivamento", key: "arquivo", width: 14 },
      { header: "Pontuação", key: "pontos", width: 11 },
      { header: "Residência (A)", key: "pA", width: 13 },
      { header: "Campo (B)", key: "pB", width: 11 },
      { header: "Eléctrica (C)", key: "pC", width: 12 },
      { header: "Digital (D)", key: "pD", width: 11 },
      { header: "Carta (E)", key: "pE", width: 10 },
      { header: "Comunicação (F)", key: "pF", width: 15 },
      { header: "Completude (G)", key: "pG", width: 14 },
      { header: "Alertas", key: "pAl", width: 9 },
    ];

    // Cabeçalho com as cores da empresa
    const cabecalho = folha.getRow(1);
    cabecalho.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cabecalho.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF141414" } };
    cabecalho.alignment = { vertical: "middle", horizontal: "center" };
    cabecalho.height = 24;

    // ------------------------------------------------------------ LINHAS
    // Os documentos vivem num bucket privado: em vez de links que expiram
    // ao fim de uma hora, o Excel aponta para a ficha no painel, onde estão
    // sempre disponíveis para ver e descarregar.
    const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

    candidatos.forEach((c) => {
      const linha = folha.addRow({
        ref: c.id.slice(0, 8).toUpperCase(),
        data: new Date(c.created_at),
        nome: c.nome,
        bi: c.bi,
        provincia: c.provincia,
        municipio: c.municipio,
        telefone: `+${c.telefone}`,
        email: c.email,
        nivel: c.nivel_academico,
        curso: c.curso ?? "",
        mtbt: simNao(c.conhece_mtbt),
        carta: simNao(c.tem_carta),
        exp: simNao(c.experiencia_similar),
        expdoc: c.experiencia_url ? "Sim" : "-",
        condicoes: simNao(c.condicoes_aceites),
        status: c.status,
        obs: c.observacoes ?? "",
        docs: "",
        ficha: "",
        drive: "",
        arquivo:
          c.arquivamento_estado === "concluido"
            ? "Arquivado"
            : c.arquivamento_estado === "erro"
              ? "Falhou"
              : "Pendente",
        ...(() => {
          const a = pontuacoes.get(c.id);
          if (!a) return {};
          const det = a.pontuacao_detalhe as
            | { criterios?: { codigo: string; pontos: number }[] }
            | null;
          const p = (cod: string) =>
            det?.criterios?.find((x) => x.codigo === cod)?.pontos ?? "";
          const somaB = ["B1", "B2", "B3", "B4"].reduce(
            (s, cod) => s + (det?.criterios?.find((x) => x.codigo === cod)?.pontos ?? 0),
            0
          );
          return {
            pontos: a.eliminado ? "Eliminado" : (a.pontuacao_total ?? ""),
            pA: p("A"),
            pB: det ? somaB : "",
            pC: p("C"),
            pD: p("D"),
            pE: p("E"),
            pF: p("F"),
            pG: p("G"),
            pAl: Array.isArray(a.alertas) ? a.alertas.length : "",
          };
        })(),
      });

      linha.getCell("data").numFmt = "dd/mm/yyyy hh:mm";

      // Quantos documentos o candidato anexou.
      const anexos = [c.cv_url, c.bi_url, c.certificado_url, c.experiencia_url].filter(Boolean);
      linha.getCell("docs").value = `${anexos.length} anexo(s)`;

      // Link directo para a ficha no painel, onde se vêem e descarregam.
      const ficha = `${base}/admin/candidato/${c.id}`;
      linha.getCell("ficha").value = { text: "Abrir ficha", hyperlink: ficha };
      linha.getCell("ficha").font = { color: { argb: "FF0563C1" }, underline: true };

      // Cor de fundo conforme o estado, para ler de relance.
      const cores: Record<string, string> = {
        Aprovado: "FFDCFCE7",
        Reprovado: "FFFFE4E6",
        Contactado: "FFE0F2FE",
        Pendente: "FFFEF3C7",
      };

      linha.getCell("status").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: cores[c.status] ?? "FFFFFFFF" },
      };

      if (c.drive_folder_url) {
        linha.getCell("drive").value = { text: "Abrir pasta", hyperlink: c.drive_folder_url };
        linha.getCell("drive").font = { color: { argb: "FF0563C1" }, underline: true };
      } else {
        linha.getCell("drive").value = "-";
      }
    });

    folha.autoFilter = { from: "A1", to: { row: 1, column: folha.columns.length } };

    // ------------------------------------------------- FOLHA DE RESUMO
    const resumo = livro.addWorksheet("Resumo");
    resumo.columns = [
      { header: "Indicador", key: "ind", width: 34 },
      { header: "Valor", key: "val", width: 12 },
    ];
    resumo.getRow(1).font = { bold: true };

    const contar = (f: (c: Candidato) => boolean) => candidatos.filter(f).length;

    resumo.addRows([
      { ind: "Total de candidaturas", val: candidatos.length },
      { ind: "Pendentes", val: contar((c) => c.status === "Pendente") },
      { ind: "Aprovados", val: contar((c) => c.status === "Aprovado") },
      { ind: "Contactados", val: contar((c) => c.status === "Contactado") },
      { ind: "Reprovados", val: contar((c) => c.status === "Reprovado") },
      { ind: "Com carta de condução", val: contar((c) => c.tem_carta) },
      { ind: "Com formação técnica", val: contar((c) => Boolean(c.curso)) },
      { ind: "Com experiência similar", val: contar((c) => c.experiencia_similar) },
      { ind: "Com comprovativo anexado", val: contar((c) => Boolean(c.experiencia_url)) },
    ]);

    resumo.addRow([]);
    resumo.addRow({ ind: "Por província", val: "" }).font = { bold: true };
    const provincias = Array.from(new Set(candidatos.map((c) => c.provincia))).sort();
    provincias.forEach((pr) => resumo.addRow({ ind: pr, val: contar((c) => c.provincia === pr) }));

    resumo.addRow([]);
    resumo.addRow({ ind: "Por município", val: "" }).font = { bold: true };

    const municipios = Array.from(new Set(candidatos.map((c) => c.municipio))).sort();
    municipios.forEach((m) => resumo.addRow({ ind: m, val: contar((c) => c.municipio === m) }));

    resumo.addRow([]);
    resumo.addRow({ ind: "Exportado em", val: dataHora(new Date().toISOString()) });

    // ------------------------------------------------------------ SAÍDA
    const buffer = await livro.xlsx.writeBuffer();
    const nomeFicheiro = `Candidaturas_Consulvolt_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nomeFicheiro}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (erro) {
    console.error("[exportar] falhou:", erro);
    return NextResponse.json(
      { erro: "Não foi possível gerar o ficheiro Excel.", detalhe: String(erro) },
      { status: 500 }
    );
  }
}
