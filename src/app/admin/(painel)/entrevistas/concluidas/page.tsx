import { PaginaDeEntrevistas } from "@/app/admin/(painel)/entrevistas/pagina-comum";

export const dynamic = "force-dynamic";

export default function Pagina({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  return (
    <PaginaDeEntrevistas
      estados={["concluida"]}
      comIndicadores={false}
      searchParams={searchParams}
      vazio={{
        titulo: "Nenhuma entrevista concluída",
        texto: "Uma entrevista fica concluída quando a avaliação é guardada.",
      }}
    />
  );
}
