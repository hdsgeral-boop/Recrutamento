import { z } from "zod";
import {
  MUNICIPIOS_POR_PROVINCIA,
  NIVEIS_ACADEMICOS,
  PROVINCIAS,
  TAMANHO_MAXIMO_FICHEIRO,
  TAMANHO_MAXIMO_KB,
  TIPOS_ACEITES,
} from "@/lib/constantes";

/** "Sim"/"Não" vindos dos botões de rádio -> booleano. */
const simNao = z.enum(["sim", "nao"], {
  required_error: "Escolhe Sim ou Não.",
});

/**
 * Normaliza um telefone angolano para o formato 2449XXXXXXXX (usado no wa.me).
 * Aceita 9XX XXX XXX, +244 9XX..., 00244 9XX..., com espaços ou traços.
 */
export function normalizarTelefone(valor: string): string {
  let digitos = valor.replace(/\D/g, "");
  if (digitos.startsWith("00244")) digitos = digitos.slice(2);
  if (digitos.startsWith("244")) return digitos;
  if (digitos.length === 9 && digitos.startsWith("9")) return `244${digitos}`;
  return digitos;
}

/**
 * Valida um telemóvel angolano.
 * Os números nacionais têm 9 dígitos e começam sempre por 9, seguido do
 * indicativo do operador: 91 e 99 (Movicel), 92, 93 e 94 (Unitel), 95
 * (Africell). O 90 não está atribuído, e os fixos começam por 2.
 */
export function telefoneValido(valor: string): boolean {
  const n = normalizarTelefone(valor);
  return /^2449[1-9]\d{7}$/.test(n);
}

/**
 * Valida o Nº do Bilhete de Identidade angolano.
 * Formato: 9 dígitos + 2 letras (província de emissão) + 3 dígitos.
 * Exemplo: 006151112LA041 - 14 caracteres ao todo.
 */
export function biValido(valor: string): boolean {
  return /^\d{9}[A-Z]{2}\d{3}$/.test(valor.trim().toUpperCase());
}

/** Domínios mal escritos que aparecem sempre nos formulários. */
const ENGANOS_COMUNS: Record<string, string> = {
  "gmail.con": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.comm": "gmail.com",
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "hotmail.con": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.con": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
};

/** Se o domínio for um engano conhecido, devolve a sugestão. */
export function sugerirEmail(email: string): string | null {
  const partes = email.trim().toLowerCase().split("@");
  if (partes.length !== 2) return null;
  const correcto = ENGANOS_COMUNS[partes[1]];
  return correcto ? `${partes[0]}@${correcto}` : null;
}

/**
 * Valida o endereço de email com mais rigor do que o .email() do zod:
 * exige um domínio com ponto, extensão de 2 a 12 letras, e recusa pontos
 * seguidos ou no princípio/fim - os erros que mais aparecem.
 */
export function emailValido(valor: string): boolean {
  const e = valor.trim().toLowerCase();
  if (e.length > 254 || e.includes("..")) return false;
  if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,12}$/.test(e)) return false;
  const [local, dominio] = e.split("@");
  if (local.startsWith(".") || local.endsWith(".")) return false;
  if (dominio.startsWith("-") || dominio.endsWith("-")) return false;
  return true;
}

/** Esquema dos campos de texto do formulário (sem os ficheiros). */
export const esquemaCandidatura = z
  .object({
    nome: z
      .string()
      .trim()
      .min(5, "Escreve o nome completo.")
      .max(120, "Nome demasiado longo.")
      .regex(/^[\p{L}\s.'-]+$/u, "O nome só pode ter letras, espaços, hífenes e apóstrofos."),

    bi: z
      .string()
      .trim()
      .toUpperCase()
      .refine(
        biValido,
        "Nº de BI inválido. São 9 números, 2 letras e 3 números. Ex.: 006151112LA041."
      ),

    provincia: z.enum(PROVINCIAS, { required_error: "Escolhe a província." }),

    municipio: z.string().min(1, "Escolhe o município."),

    telefone: z
      .string()
      .trim()
      .refine(telefoneValido, "Número inválido. Usa o formato 9XX XXX XXX (Angola)."),

    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(6, "Email demasiado curto.")
      .refine(emailValido, "Email inválido. Confere se escreveste bem, ex.: nome@gmail.com."),

    nivel_academico: z.enum(NIVEIS_ACADEMICOS, {
      required_error: "Escolhe o nível académico.",
    }),

    curso: z.string().trim().max(120, "Nome do curso demasiado longo.").optional().or(z.literal("")),

    conhece_mtbt: simNao.optional().default("nao"),
    tem_carta: simNao,
    experiencia_similar: simNao,

    // A caixa de tomada de conhecimento das condições de trabalho.
    condicoes_aceites: z.literal(true, {
      errorMap: () => ({ message: "Tens de confirmar que tomaste conhecimento das condições." }),
    }),
  })
  // O município tem de pertencer mesmo à província escolhida.
  .superRefine((dados, ctx) => {
    const lista = MUNICIPIOS_POR_PROVINCIA[dados.provincia];
    if (lista && !lista.includes(dados.municipio)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["municipio"],
        message: `${dados.municipio} não pertence à província de ${dados.provincia}.`,
      });
    }
  });

export type DadosCandidatura = z.infer<typeof esquemaCandidatura>;

/** Converte "sim"/"nao" em booleano. */
export const paraBooleano = (v: "sim" | "nao") => v === "sim";

/**
 * Valida um ficheiro carregado: tamanho e tipo.
 * Devolve null se estiver tudo bem, ou a mensagem de erro.
 */
export function validarFicheiro(ficheiro: File | null | undefined, etiqueta: string): string | null {
  if (!ficheiro || ficheiro.size === 0) return `Falta anexar o documento: ${etiqueta}.`;
  if (ficheiro.size > TAMANHO_MAXIMO_FICHEIRO) {
    const kb = Math.round(ficheiro.size / 1024);
    return `${etiqueta}: o ficheiro tem ${kb} KB. O máximo é ${TAMANHO_MAXIMO_KB} KB.`;
  }
  if (!TIPOS_ACEITES.includes(ficheiro.type as (typeof TIPOS_ACEITES)[number])) {
    return `${etiqueta}: só aceitamos ficheiros .pdf, .jpg ou .png.`;
  }
  return null;
}

/** Esquema usado pelo painel ao mudar o estado de uma candidatura. */
export const esquemaMudancaStatus = z.object({
  id: z.string().uuid("Identificador inválido."),
  // Deixou de ser um enum fechado porque a lista passou a ser configurável em
  // Definições. Quem decide se o valor é aceitável é a acção, que o confronta
  // com a lista realmente configurada: a regra tem de viver onde a lista vive.
  status: z.string().trim().min(1, "Falta indicar o estado.").max(40, "Esse estado é comprido de mais."),
  observacoes: z.string().trim().max(2000).optional(),
});

/**
 * Limpa um texto para poder ser usado como nome de pasta/ficheiro no Drive.
 * Tira acentos, barras e caracteres que dão problema.
 */
export function limparNomeFicheiro(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s_-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);
}
