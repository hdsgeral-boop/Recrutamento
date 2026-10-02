import { AtribuirRecrutadores } from "@/components/atribuir-recrutadores";
import { FaltaMigracao } from "@/app/admin/(painel)/entrevistas/pagina-comum";
import { carregarEntrevistas, listarRecrutadores } from "@/lib/entrevista/atribuicoes";

export const dynamic = "force-dynamic";

export default async function Atribuicao() {
  const [{ linhas, porMigrar, totalCandidatos }, recrutadores] = await Promise.all([
    carregarEntrevistas(),
    listarRecrutadores(),
  ]);

  if (porMigrar) return <FaltaMigracao />;

  return (
    <div className="space-y-3">
      {totalCandidatos > linhas.length && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-muted-foreground">
          Só aparecem os <strong>{linhas.length}</strong> candidatos já contactados. Quem ainda não
          foi contactado não se atribui: primeiro marca-se a entrevista em Comunicações.
        </p>
      )}
      <AtribuirRecrutadores linhas={linhas} recrutadores={recrutadores} />
    </div>
  );
}
