import { createFileRoute } from "@tanstack/react-router";
import { Agenda } from "../-agenda/agenda";
import { agendaSearchSchema } from "../-agenda/search";

export const Route = createFileRoute("/_app/agenda")({
	validateSearch: agendaSearchSchema,
	component: Agenda,
});
