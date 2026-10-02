import "server-only";
import { obterDrive } from "@/lib/google-drive";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * ===========================================================================
 * EXTRACÇÃO DE TEXTO - OCR gratuito pelo Google Drive
 * ---------------------------------------------------------------------------
 * Os ficheiros já estão no Drive e pertencem à aplicação, logo são acessíveis
 * dentro do âmbito drive.file. O Drive sabe converter PDF ou imagem em Google
 * Doc, e nessa conversão extrai a camada de texto quando existe e faz
 * reconhecimento óptico quando não existe. Um só caminho serve para CVs em
 * PDF nativo, BIs digitalizados e certificados fotografados.
 *
 * Ciclo: copiar forçando o tipo Google Doc, exportar como texto simples,
 * apagar o Doc temporário.
 *
 * LIMITAÇÕES, que valem a pena conhecer antes de confiar no resultado:
 *
 *  - O OCR do Drive processa apenas as PRIMEIRAS 10 PÁGINAS de um PDF.
 *    Chega para CVs e certificados; documentos maiores ficam truncados e
 *    geram o alerta pdf_truncado.
 *  - A qualidade cai muito em fotografias tremidas ou com pouca luz. É para
 *    isso que serve a coluna `legivel`: o painel pede outra cópia ao candidato.
 *  - É lento: 3 a 8 segundos por ficheiro. NUNCA correr dentro do pedido HTTP
 *    do candidato - só em segundo plano.
 * ===========================================================================
 */

const LIMITE_CARACTERES = 20000;
const MINIMO_LEGIVEL = 120;

export type TipoDocumento = "cv" | "bi" | "certificado" | "experiencia" | "outro";

export interface TextoDocumento {
  driveFileId: string;
  tipo: TipoDocumento;
  nomeFicheiro: string;
  texto: string;
  legivel: boolean;
  erro: string | null;
}

/** Colapsa espaços, corta linhas vazias repetidas e limita o tamanho. */
export function normalizarTexto(bruto: string): string {
  return bruto
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim()
    .slice(0, LIMITE_CARACTERES);
}

/** Adivinha o tipo pelo nome que o arquivamento deu ao ficheiro. */
export function tipoPeloNome(nome: string): TipoDocumento {
  const n = nome.toLowerCase();
  if (n.startsWith("cv_") || n.includes("curriculum")) return "cv";
  if (n.startsWith("bi_") || n.includes("bilhete")) return "bi";
  if (n.startsWith("certificado")) return "certificado";
  if (n.startsWith("experiencia") || n.includes("comprovativo")) return "experiencia";
  return "outro";
}

/**
 * Corre o OCR de um ficheiro do Drive.
 * O Doc temporário é apagado no `finally`, mesmo que a exportação rebente -
 * senão o Drive do utilizador enche-se de lixo.
 */
export async function extrairTextoDoDrive(
  driveFileId: string,
  nomeFicheiro: string
): Promise<{ texto: string; erro: string | null }> {
  const drive = obterDrive();
  let copiaId: string | null = null;

  try {
    const copia = await drive.files.copy({
      fileId: driveFileId,
      requestBody: {
        name: `__ocr_tmp_${driveFileId}`,
        mimeType: "application/vnd.google-apps.document",
      },
      ocrLanguage: "pt",
      fields: "id",
    });

    copiaId = copia.data.id ?? null;
    if (!copiaId) throw new Error("O Drive não devolveu o ID da cópia.");

    const exportado = await drive.files.export(
      { fileId: copiaId, mimeType: "text/plain" },
      { responseType: "text" }
    );

    const bruto = typeof exportado.data === "string" ? exportado.data : String(exportado.data ?? "");
    return { texto: normalizarTexto(bruto), erro: null };
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    console.error(`[ocr] ${nomeFicheiro} falhou:`, msg);
    return { texto: "", erro: msg.slice(0, 400) };
  } finally {
    if (copiaId) {
      try {
        await drive.files.delete({ fileId: copiaId });
      } catch (e) {
        console.error("[ocr] não consegui apagar o Doc temporário:", copiaId, e);
      }
    }
  }
}

/**
 * Devolve o texto de um documento, com cache.
 * Se já houver linha em documentos_texto para aquele ficheiro, reutiliza-a:
 * o OCR não se repete de cada vez que a rubrica muda.
 */
export async function obterTextoComCache(
  candidatoId: string,
  driveFileId: string,
  nomeFicheiro: string,
  sha256: string | null,
  forcar = false
): Promise<TextoDocumento> {
  const supabase = criarClienteServidor();
  const tipo = tipoPeloNome(nomeFicheiro);

  if (!forcar) {
    const { data } = await supabase
      .from("documentos_texto")
      .select("*")
      .eq("drive_file_id", driveFileId)
      .maybeSingle();

    if (data && (data.texto || data.erro)) {
      return {
        driveFileId,
        tipo: data.tipo_documento as TipoDocumento,
        nomeFicheiro: data.nome_ficheiro as string,
        texto: (data.texto as string) ?? "",
        legivel: Boolean(data.legivel),
        erro: (data.erro as string) ?? null,
      };
    }
  }

  const { texto, erro } = await extrairTextoDoDrive(driveFileId, nomeFicheiro);
  const legivel = texto.length >= MINIMO_LEGIVEL;

  await supabase.from("documentos_texto").upsert(
    {
      candidato_id: candidatoId,
      drive_file_id: driveFileId,
      tipo_documento: tipo,
      nome_ficheiro: nomeFicheiro,
      sha256,
      texto: texto || null,
      erro,
    },
    { onConflict: "drive_file_id" }
  );

  return { driveFileId, tipo, nomeFicheiro, texto, legivel, erro };
}

/** Testa o ciclo completo num ficheiro real, para o diagnóstico do painel. */
export async function testarOcrDrive(
  driveFileId: string
): Promise<{ ok: boolean; mensagem: string }> {
  try {
    const { texto, erro } = await extrairTextoDoDrive(driveFileId, "teste");
    if (erro) return { ok: false, mensagem: erro };
    return {
      ok: true,
      mensagem: `OCR a funcionar: ${texto.length} caracteres extraídos e Doc temporário apagado.`,
    };
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : String(erro) };
  }
}
