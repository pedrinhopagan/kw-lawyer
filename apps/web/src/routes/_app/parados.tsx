import { createFileRoute } from "@tanstack/react-router";
import { Parados } from "../-parados/parados";

export const Route = createFileRoute("/_app/parados")({
	component: Parados,
});
