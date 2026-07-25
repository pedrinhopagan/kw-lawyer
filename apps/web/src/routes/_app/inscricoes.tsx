import { createFileRoute } from "@tanstack/react-router";
import { Inscricoes } from "../-inscricoes/inscricoes";

export const Route = createFileRoute("/_app/inscricoes")({
	component: Inscricoes,
});
