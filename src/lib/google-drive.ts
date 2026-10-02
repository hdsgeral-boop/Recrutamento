import "server-only";
import { google, type drive_v3 } from "googleapis";
import { Readable } from "node:stream";
import { PASTA_RAIZ_DRIVE } from "@/lib/constantes";
import { limparNomeFicheiro } from "@/lib/validacoes";

/**
 * ===========================================================================
 * ARQUIVAMENTO NO GOOGLE DRIVE
 * ---------------------------------------------------------------------------
 * Usa uma Service Account (autenticação de servidor-para-servidor, sem
 * intervenção humana), ou por OAuth2 em nome de um utilizador. A pasta-mãe
 * é resolvida por resolverPastaMae(): com o âmbito drive.file, uma pasta
 * criada à mão é invisível, e nesse caso usamos a raiz do disco.
 *
 * Estrutura criada:
 *   <pasta-mãe>/Recrutamento_Bengo_2026/<Nome_Completo>_<BI>/
 *       ├── CV_<Nome>_<BI>.pdf
 *       ├── BI_<Nome>_<BI>.pdf
 *       └── Certificado_<Nome>_<BI>.pdf
 * ===========================================================================
 */

/**
 * O âmbito drive.file dá acesso apenas aos ficheiros que esta aplicação cria.
 * Não vê nem toca no resto do Drive - e é o que evita o processo de
 * verificação do Google, que o âmbito completo obrigaria.
 */
const ESCOPOS = ["https://www.googleapis.com/auth/drive.file"];

/**
 * Há duas formas de autenticar, e o sistema escolhe sozinho conforme as
 * variáveis que estiverem definidas:
 *
 *  1. OAUTH2 (conta pessoal) - o sistema escreve EM NOME do utilizador que
 *     autorizou uma vez. Os ficheiros ficam a pertencer a essa pessoa e
 *     ocupam o espaço dela. É a única via possível numa conta Google pessoal.
 *
 *  2. CONTA DE SERVIÇO (Google Workspace) - só funciona se a pasta-mãe estiver
 *     numa Drive Partilhada, porque as contas de serviço NÃO TÊM QUOTA e não
 *     podem ser donas de ficheiros. Numa pasta pessoal partilhada com a conta
 *     de serviço, o Drive responde sempre "storageQuotaExceeded".
 *
 * Se as duas estiverem configuradas, ganha o OAuth2.
 */
type Modo = "oauth2" | "conta-de-servico";

function modoActivo(): Modo | null {
  if (
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  ) {
    return "oauth2";
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return "conta-de-servico";
  return null;
}

/** Lê e valida o JSON da Service Account que está na variável de ambiente. */
function lerCredenciais() {
  const bruto = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!bruto) {
    throw new Error("Falta a variável GOOGLE_SERVICE_ACCOUNT_JSON.");
  }

  let json: { client_email?: string; private_key?: string };
  try {
    json = JSON.parse(bruto);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON não é um JSON válido. Cola o ficheiro inteiro numa só linha."
    );
  }

  if (!json.client_email || !json.private_key) {
    throw new Error("O JSON da Service Account não tem client_email ou private_key.");
  }

  // Na Vercel as quebras de linha da chave vêm escapadas como \n literais.
  const chave = json.private_key.replace(/\\n/g, "\n");

  return { email: json.client_email, chave };
}

/** Devolve um cliente autenticado da Drive API, pela via que estiver configurada. */
export function obterDrive(): drive_v3.Drive {
  const modo = modoActivo();

  if (modo === "oauth2") {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET
    );
    // Com o refresh token, a biblioteca renova o acesso sozinha a cada pedido.
    auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
    return google.drive({ version: "v3", auth });
  }

  if (modo === "conta-de-servico") {
    const { email, chave } = lerCredenciais();
    const auth = new google.auth.JWT({ email, key: chave, scopes: ESCOPOS });
    return google.drive({ version: "v3", auth });
  }

  throw new Error(
    "Google Drive por configurar: define GOOGLE_OAUTH_CLIENT_ID, " +
      "GOOGLE_OAUTH_CLIENT_SECRET e GOOGLE_OAUTH_REFRESH_TOKEN (conta pessoal), " +
      "ou GOOGLE_SERVICE_ACCOUNT_JSON (Drive Partilhada do Workspace)."
  );
}

/** true quando a pasta-mãe está numa Drive Partilhada (Shared Drive). */
const emDrivePartilhada = () => process.env.GOOGLE_DRIVE_SHARED_DRIVE === "true";

/** Opções comuns a enviar em todos os pedidos (necessárias em Shared Drives). */
const opcoesPartilha = () =>
  emDrivePartilhada() ? { supportsAllDrives: true, includeItemsFromAllDrives: true } : {};

/**
 * Procura uma pasta pelo nome dentro de um pai. Se não existir, cria.
 * Evita duplicados quando duas candidaturas chegam ao mesmo tempo.
 */
async function garantirPasta(drive: drive_v3.Drive, nome: string, paiId: string): Promise<string> {
  const nomeEscapado = nome.replace(/'/g, "\\'");

  const procura = await drive.files.list({
    q: `name = '${nomeEscapado}' and '${paiId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    pageSize: 1,
    ...opcoesPartilha(),
  });

  const existente = procura.data.files?.[0]?.id;
  if (existente) return existente;

  const criada = await drive.files.create({
    requestBody: {
      name: nome,
      mimeType: "application/vnd.google-apps.folder",
      parents: [paiId],
    },
    fields: "id",
    ...opcoesPartilha(),
  });

  if (!criada.data.id) throw new Error(`Não foi possível criar a pasta "${nome}" no Drive.`);
  return criada.data.id;
}

/**
 * Descobre onde pendurar a pasta do ano.
 *
 * Com o âmbito drive.file, a aplicação só vê os ficheiros que ELA criou - uma
 * pasta feita à mão no Drive é invisível para ela e devolve "File not found".
 * Por isso: se houver um GOOGLE_DRIVE_FOLDER_ID acessível, usamo-lo (é o caso
 * das Drives Partilhadas); se não, penduramos na raiz do disco do utilizador,
 * onde a aplicação pode criar à vontade e o dono dos ficheiros é ele.
 */
let paiResolvido: string | null = null;

async function resolverPastaMae(drive: drive_v3.Drive): Promise<string> {
  if (paiResolvido) return paiResolvido;

  const configurado = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();

  if (configurado) {
    try {
      await drive.files.get({ fileId: configurado, fields: "id", ...opcoesPartilha() });
      paiResolvido = configurado;
      return paiResolvido;
    } catch {
      console.warn(
        `[drive] a pasta ${configurado} não está acessível a esta aplicação ` +
          `(normal com o âmbito drive.file numa pasta criada à mão). ` +
          `A usar a raiz do disco.`
      );
    }
  }

  paiResolvido = "root";
  return paiResolvido;
}

export interface FicheiroParaDrive {
  nome: string;
  tipo: string;
  conteudo: Buffer;
}

export interface ResultadoArquivo {
  pastaId: string;
  pastaUrl: string;
  ficheiros: { nome: string; id: string; url: string }[];
}

/**
 * Cria (ou reaproveita) a pasta do candidato e envia lá para dentro os
 * documentos. Devolve o link partilhável da pasta.
 */
export async function arquivarNoDrive(
  nomeCandidato: string,
  bi: string,
  ficheiros: FicheiroParaDrive[]
): Promise<ResultadoArquivo> {
  const drive = obterDrive();
  const paiId = await resolverPastaMae(drive);

  // 1) /Recrutamento_Bengo_2026/
  const raizId = await garantirPasta(drive, PASTA_RAIZ_DRIVE, paiId);

  // 2) /Recrutamento_Bengo_2026/NomeCompleto_BI/
  const nomePasta = `${limparNomeFicheiro(nomeCandidato)}_${limparNomeFicheiro(bi)}`;
  const pastaId = await garantirPasta(drive, nomePasta, raizId);

  // 3) Enviar os documentos, um a um (o Drive não tem envio em lote).
  const enviados: ResultadoArquivo["ficheiros"] = [];

  for (const f of ficheiros) {
    const criado = await drive.files.create({
      requestBody: { name: f.nome, parents: [pastaId] },
      media: { mimeType: f.tipo, body: Readable.from(f.conteudo) },
      fields: "id, name, webViewLink",
      ...opcoesPartilha(),
    });

    enviados.push({
      nome: f.nome,
      id: criado.data.id ?? "",
      url: criado.data.webViewLink ?? `https://drive.google.com/file/d/${criado.data.id}/view`,
    });
  }

  // 4) Dar acesso de leitura a quem tiver o link (para o RH abrir do email).
  //    Em Shared Drives isto pode estar bloqueado pela política da organização:
  //    se falhar, seguimos em frente - a pasta continua acessível a quem tem
  //    permissão na Drive.
  try {
    await drive.permissions.create({
      fileId: pastaId,
      requestBody: { role: "reader", type: "anyone" },
      ...opcoesPartilha(),
    });
  } catch (erro) {
    console.warn("[drive] não foi possível tornar a pasta pública:", erro);
  }

  return {
    pastaId,
    pastaUrl: `https://drive.google.com/drive/folders/${pastaId}`,
    ficheiros: enviados,
  };
}

/**
 * Encontra a pasta de um candidato que já foi arquivado, quando a coluna
 * drive_folder_id ainda está vazia (candidaturas anteriores à migração do
 * ranking). Procura pelo mesmo nome que o arquivamento usa e, se não achar,
 * tenta só pelo número do BI, que é o que nunca muda.
 *
 * Devolve null em vez de atirar: não achar a pasta não é motivo para a
 * análise inteira falhar.
 */
export async function encontrarPastaDoCandidato(
  nomeCandidato: string,
  bi: string
): Promise<string | null> {
  try {
    const drive = obterDrive();
    const paiId = await resolverPastaMae(drive);

    const raiz = await drive.files.list({
      q: `name = '${PASTA_RAIZ_DRIVE}' and '${paiId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)",
      pageSize: 1,
      ...opcoesPartilha(),
    });

    const raizId = raiz.data.files?.[0]?.id;
    if (!raizId) return null;

    const nomeExacto = `${limparNomeFicheiro(nomeCandidato)}_${limparNomeFicheiro(bi)}`;
    const exacta = await drive.files.list({
      q: `name = '${nomeExacto.replace(/'/g, "\\'")}' and '${raizId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)",
      pageSize: 1,
      ...opcoesPartilha(),
    });
    if (exacta.data.files?.[0]?.id) return exacta.data.files[0].id as string;

    // Segunda tentativa: pelo BI, que sobrevive a diferenças de acentuação
    // ou de espaços no nome.
    const porBi = await drive.files.list({
      q: `name contains '${limparNomeFicheiro(bi)}' and '${raizId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
      pageSize: 5,
      ...opcoesPartilha(),
    });

    return (porBi.data.files?.[0]?.id as string) ?? null;
  } catch (erro) {
    console.error("[drive] não consegui encontrar a pasta do candidato:", erro);
    return null;
  }
}

/**
 * Testa a ligação ao Drive de forma honesta: não basta autenticar, é preciso
 * conseguir mesmo criar. Cria a pasta do ano (ou reaproveita-a, se já existir)
 * e diz por que via e em que sítio ficou.
 */
export async function testarLigacaoDrive(): Promise<{ ok: boolean; mensagem: string }> {
  try {
    const modo = modoActivo();
    if (!modo) return { ok: false, mensagem: "Nenhuma via de autenticação configurada." };

    const drive = obterDrive();
    const paiId = await resolverPastaMae(drive);
    const raizId = await garantirPasta(drive, PASTA_RAIZ_DRIVE, paiId);

    const via = modo === "oauth2" ? "OAuth2, em nome do utilizador" : "conta de serviço";
    const sitio = paiId === "root" ? "na raiz do disco" : "na pasta configurada";

    return {
      ok: true,
      mensagem: `Pasta "${PASTA_RAIZ_DRIVE}" pronta ${sitio} (${via}): https://drive.google.com/drive/folders/${raizId}`,
    };
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : String(erro) };
  }
}
