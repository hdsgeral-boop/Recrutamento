import { redirect } from "next/navigation";

/** A raiz do site leva directamente ao formulário de candidatura. */
export default function Inicio() {
  redirect("/app");
}
