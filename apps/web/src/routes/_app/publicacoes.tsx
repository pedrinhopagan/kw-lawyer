import { createFileRoute } from "@tanstack/react-router";
import { Inbox } from "../-publicacoes/inbox";
import { inboxSearchSchema } from "../-publicacoes/search";

export const Route = createFileRoute("/_app/publicacoes")({
	validateSearch: inboxSearchSchema,
	component: Inbox,
});
