import { createFileRoute } from "@tanstack/react-router";
import { Configuracoes } from "../-configuracoes/configuracoes";

export const Route = createFileRoute("/_app/configuracoes")({
	component: Configuracoes,
});
