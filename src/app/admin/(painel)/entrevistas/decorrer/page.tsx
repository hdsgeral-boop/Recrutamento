import { PaginaDeEntrevistas } from "@/app/admin/(painel)/entrevistas/pagina-comum";

export const dynamic = "force-dynamic";

export default function Pagina({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  return (
    <PaginaDeEntrevistas
      estados={["em_entrevista"]}
      comIndicadores={false}
      searchParams={searchParams}
      vazio={{
        titulo: "Nenhuma entrevista a decorrer",
        texto: "Aparecem aqui as que foram começadas e ainda não têm avaliação guardada.",
      }}
    />
  );
}
