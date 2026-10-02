import { FaltaMigracao } from "@/app/admin/(painel)/entrevistas/pagina-comum";
import { RemarcarAtrasadas } from "@/components/remarcar-atrasadas";
import { carregarEntrevistas } from "@/lib/entrevista/atribuicoes";
import { estaAtrasada } from "@/lib/entrevista/quando";
import { podeNaSessao } from "@/lib/utilizadores";

export const dynamic = "force-dynamic";

/**
 * As entrevistas que ficaram para trás.
 *
 * "Atrasada" é uma coisa que se DEDUZ, não que se guarde: data já passada e
 * sem avaliação. Guardar uma coluna "atrasada" obrigava alguém, ou algum
 * processo nocturno, a mantê-la certa - e um dia deixava de estar.
 *
 * As concluídas não entram: uma entrevista de ontem que foi feita e avaliada
 * está no sítio certo, não está atrasada.
 */
export default async function Atrasadas() {
  const [{ linhas, porMigrar }, podeEnviarEmail] = await Promise.all([
    carregarEntrevistas(),
    podeNaSessao("enviar_email"),
  ]);

  if (porMigrar) return <FaltaMigracao />;

  const atrasadas = linhas
    .filter((l) => l.estado !== "concluida" && l.estado !== "cancelada" && estaAtrasada(l.quando))
    .sort((a, b) => (a.quando ?? "").localeCompare(b.quando ?? ""));

  return <RemarcarAtrasadas linhas={atrasadas} podeEnviarEmail={podeEnviarEmail} />;
}
