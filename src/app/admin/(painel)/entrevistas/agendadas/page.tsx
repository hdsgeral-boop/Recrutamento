import { PaginaDeEntrevistas } from "@/app/admin/(painel)/entrevistas/pagina-comum";

export const dynamic = "force-dynamic";

export default function Pagina({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  return (
    <PaginaDeEntrevistas
      estados={["agendada"]}
      comIndicadores={false}
      searchParams={searchParams}
      vazio={{
        titulo: "Nenhuma entrevista agendada",
        texto: "Uma entrevista fica agendada quando tem recrutador e data. A data marca-se em Comunicações, na Agenda.",
      }}
    />
  );
}
