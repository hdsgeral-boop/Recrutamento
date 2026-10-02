import { EditorRoteiro } from "@/components/editor-roteiro";
import { lerRoteiroEmVigor } from "@/lib/entrevista/carregar-roteiro";

export const dynamic = "force-dynamic";

/**
 * O roteiro vive aqui, na área de Entrevistas, que é onde se procura.
 * A mesma secção continua a aparecer em Definições, para quem já lá ia -
 * é o mesmo componente e a mesma versão, não duas cópias.
 */
export default async function Perguntas() {
  const roteiro = await lerRoteiroEmVigor();

  return (
    <EditorRoteiro
      versao={roteiro.versao}
      iniciais={roteiro.perguntas}
      daBaseDeDados={roteiro.daBaseDeDados}
      porMigrar={roteiro.porMigrar}
      avisos={roteiro.avisos}
      criadoEm={roteiro.criadoEm}
      criadoPor={roteiro.criadoPor}
    />
  );
}
