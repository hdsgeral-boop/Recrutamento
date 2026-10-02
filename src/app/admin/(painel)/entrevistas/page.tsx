import { PaginaDeEntrevistas } from "@/app/admin/(painel)/entrevistas/pagina-comum";

export const dynamic = "force-dynamic";

export default function Pagina({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  return (
    <PaginaDeEntrevistas
      estados={null}
      comIndicadores={true}
      searchParams={searchParams}
      vazio={{
        titulo: "Ainda não há candidatos contactados",
        texto: "Este módulo só trabalha com quem já foi contactado. Marca entrevistas em Comunicações, na Agenda, e os candidatos aparecem aqui.",
      }}
    />
  );
}
