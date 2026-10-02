/**
 * ===========================================================================
 * CONSTANTES DA PLATAFORMA DE RECRUTAMENTO CONSULVOLT
 * ---------------------------------------------------------------------------
 * Ponto central de constantes do sistema multi-concurso.
 * Os valores específicos de cada concurso (vaga, prazos, número de vagas,
 * requisitos e regras) vivem na base de dados (tabela `concursos`) e são
 * configurados directamente pelo utilizador / gestor no painel de administração.
 * ===========================================================================
 */

/**
 * Prazo-limite padrão de recurso quando um concurso ainda não tem prazo definido.
 */
export const PRAZO_CANDIDATURA = new Date("2026-12-31T23:59:59+01:00");

/** Atribuições genéricas padrão de recurso (configuráveis por concurso). */
export const ATRIBUICOES = [
  "Execução das actividades operacionais e técnicas da função",
  "Recolha e registo estruturado de informação",
  "Interacção profissional e atendimento de acordo com as normas",
  "Zelar pelo cumprimento das normas de qualidade e segurança",
  "Elaboração de relatórios periódicos de actividades",
] as const;

/** Condições de trabalho padrão de recurso (configuráveis por concurso). */
export const CONDICOES_TRABALHO = [
  "Disponibilidade para desempenhar funções conforme os requisitos do projecto.",
  "Cumprimento integral dos horários e escalas estabelecidas pela organização.",
  "Uso obrigatório dos equipamentos de protecção e ferramentas fornecidas.",
  "Postura ética, sigilo profissional e rigor no tratamento de dados.",
] as const;

/**
 * Todas as 18 províncias de Angola.
 * A plataforma aceita candidaturas de qualquer ponto do país.
 */
export const PROVINCIAS = [
  "Bengo",
  "Benguela",
  "Bié",
  "Cabinda",
  "Cuando Cubango",
  "Cuanza Norte",
  "Cuanza Sul",
  "Cunene",
  "Huambo",
  "Huíla",
  "Luanda",
  "Lunda Norte",
  "Lunda Sul",
  "Malanje",
  "Moxico",
  "Namibe",
  "Uíge",
  "Zaire",
] as const;

export type Provincia = (typeof PROVINCIAS)[number];

/**
 * Mapa completo de municípios das 18 províncias de Angola.
 */
export const MUNICIPIOS_POR_PROVINCIA: Record<Provincia, readonly string[]> = {
  Bengo: [
    "Ambriz",
    "Bula Atumba",
    "Caxito",
    "Dande",
    "Dembos",
    "Nambuangongo",
    "Pango Aluquém",
  ],
  Benguela: [
    "Baía Farta",
    "Balombo",
    "Benguela",
    "Bocoio",
    "Caimbambo",
    "Catumbela",
    "Chongoroi",
    "Cubal",
    "Ganda",
    "Lobito",
  ],
  Bié: [
    "Andulo",
    "Camacupa",
    "Catabola",
    "Chinguar",
    "Chitembo",
    "Cuemba",
    "Cunhinga",
    "Cuíto",
    "Nharea",
  ],
  Cabinda: [
    "Belize",
    "Buco-Zau",
    "Cabinda",
    "Cacongo",
  ],
  "Cuando Cubango": [
    "Calai",
    "Cuangar",
    "Cuchi",
    "Cuito Cuanavale",
    "Dirico",
    "Mavinga",
    "Menongue",
    "Nancova",
    "Rivungo",
  ],
  "Cuanza Norte": [
    "Ambaca",
    "Banga",
    "Bolongongo",
    "Cambambe",
    "Cazengo",
    "Golungo Alto",
    "Gonguembo",
    "Lucala",
    "Quiculungo",
    "Samba Caju",
  ],
  "Cuanza Sul": [
    "Amboim",
    "Cassongue",
    "Cela",
    "Conda",
    "Ebo",
    "Libolo",
    "Mussende",
    "Porto Amboim",
    "Quibala",
    "Quilenda",
    "Seles",
    "Sumbe",
  ],
  Cunene: [
    "Cahama",
    "Cuanhama",
    "Curoca",
    "Cuvelai",
    "Namacunde",
    "Ombadja",
  ],
  Huambo: [
    "Bailundo",
    "Caála",
    "Catchiungo",
    "Chicala-Choloanga",
    "Chinjenje",
    "Ecunha",
    "Huambo",
    "Londuimbali",
    "Longonjo",
    "Mungo",
    "Ucuma",
  ],
  Huíla: [
    "Caconda",
    "Caluquembe",
    "Chibia",
    "Chicomba",
    "Chipindo",
    "Cuvango",
    "Humpata",
    "Jamba",
    "Lubango",
    "Matala",
    "Quilengues",
    "Quipungo",
  ],
  Luanda: [
    "Belas",
    "Cacuaco",
    "Cazenga",
    "Icolo e Bengo",
    "Kilamba Kiaxi",
    "Luanda",
    "Quiçama",
    "Talatona",
    "Viana",
  ],
  "Lunda Norte": [
    "Cambulo",
    "Capenda-Camulemba",
    "Caungula",
    "Chitato",
    "Cuango",
    "Cuílo",
    "Lóvua",
    "Lubalo",
    "Lucapa",
    "Xá-Muteba",
  ],
  "Lunda Sul": [
    "Cacolo",
    "Dala",
    "Muconda",
    "Saurimo",
  ],
  Malanje: [
    "Cacuso",
    "Calandula",
    "Cambundi-Catembo",
    "Cangandala",
    "Caombo",
    "Cuaba Nzogo",
    "Cunda-dia-Baze",
    "Luquembo",
    "Malanje",
    "Marimba",
    "Massango",
    "Mucari",
    "Quela",
    "Quirima",
  ],
  Moxico: [
    "Alto Zambeze",
    "Bundas",
    "Camanongue",
    "Léua",
    "Luacano",
    "Luau",
    "Luchazes",
    "Lumeje",
    "Moxico",
  ],
  Namibe: [
    "Bibala",
    "Camucuio",
    "Moçâmedes",
    "Tômbwa",
    "Virei",
  ],
  Uíge: [
    "Alto Cauale",
    "Ambuíla",
    "Bembe",
    "Buengas",
    "Bungo",
    "Damba",
    "Milunga",
    "Mucaba",
    "Negage",
    "Puri",
    "Quimbele",
    "Quitexe",
    "Santa Cruz",
    "Sanza Pombo",
    "Songo",
    "Uíge",
  ],
  Zaire: [
    "Cuimba",
    "M'Banza Kongo",
    "Noqui",
    "N'Zeto",
    "Soyo",
    "Tomboco",
  ],
} as const;

/** Descobre a que província pertence um município. */
export function provinciaDoMunicipio(municipio: string): Provincia | null {
  for (const p of PROVINCIAS) {
    if (MUNICIPIOS_POR_PROVINCIA[p].includes(municipio)) return p;
  }
  return null;
}

/** Níveis académicos aceites na candidatura. */
export const NIVEIS_ACADEMICOS = [
  "Ensino Médio Técnico (12.ª classe)",
  "Ensino Médio Geral (12.ª classe)",
  "Frequência Universitária",
  "Bacharelato",
  "Licenciatura",
  "Pós-graduação ou superior",
] as const;

export type NivelAcademico = (typeof NIVEIS_ACADEMICOS)[number];

/** Vagas padrão de recurso. */
export const VAGAS_PREVISTAS_PADRAO = 10;

/** Estados possíveis de uma candidatura. */
export const STATUS = ["Pendente", "Aprovado", "Reprovado", "Contactado"] as const;

export type Status = (typeof STATUS)[number];
export type VarianteEstado = "pendente" | "aprovado" | "reprovado" | "contactado";

export const STATUS_VARIANTE: Record<string, VarianteEstado> = {
  Pendente: "pendente",
  Aprovado: "aprovado",
  Reprovado: "reprovado",
  Contactado: "contactado",
  Identificado: "pendente",
  Entrevistado: "contactado",
  Seleccionado: "aprovado",
  Contratado: "aprovado",
  Recusado: "reprovado",
  Desistiu: "reprovado",
};

export function varianteDoEstado(estado: string | null | undefined): VarianteEstado {
  if (!estado) return "pendente";
  return STATUS_VARIANTE[estado] ?? "pendente";
}

/** Limites e tipos de ficheiro aceites no upload. */
export const TAMANHO_MAXIMO_FICHEIRO = 700 * 1024; // 700 KB por ficheiro
export const TAMANHO_MAXIMO_KB = 700;
export const TIPOS_ACEITES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const EXTENSOES_ACEITES = [".pdf", ".jpg", ".jpeg", ".png"] as const;

/** Documentos obrigatórios na candidatura. */
export const DOCUMENTOS = [
  { chave: "cv", etiqueta: "Curriculum Vitae", ficheiro: "CV" },
  { chave: "bi", etiqueta: "Bilhete de Identidade", ficheiro: "BI" },
  { chave: "certificado", etiqueta: "Certificado de Habilitações", ficheiro: "Certificado" },
] as const;

export type ChaveDocumento = (typeof DOCUMENTOS)[number]["chave"];

/** Nome padrão da pasta no Google Drive. */
export const PASTA_RAIZ_DRIVE = "Recrutamento_Consulvolt";

/** Nome do bucket de Storage no Supabase. */
export const BUCKET = "documentos-candidatos";

/** Dados institucionais gerais da plataforma. */
export const EMPRESA = {
  nome: "CONSULVOLT",
  nomeCompleto: "Consulvolt - Comércio e Prestação de Serviços, Lda.",
  site: "https://www.consulvolt.pt",
  morada: "Urbanização Lar do Patriota, Rua 6/8 - Luanda, Angola",
  vaga: "Processo Selectivo",
  projecto: "Recrutamento Consulvolt",
  cores: { vermelho: "#CE1B2E", amarelo: "#FCC719", preto: "#141414" },
} as const;
