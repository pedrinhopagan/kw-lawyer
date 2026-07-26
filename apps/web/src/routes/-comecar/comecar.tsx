import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { sessionQueryOptions } from "../-auth/session";
import { ComecarConvite } from "./comecar-convite";
import { ComecarFalha } from "./comecar-falha";
import { ComecarProgresso } from "./comecar-progresso";

export function Comecar() {
	const session = useQuery(sessionQueryOptions);
	const state = session.data?.lawyer?.onboardingState;

	if (!state) {
		return null;
	}

	// A carga termina no servidor e chega aqui pela invalidação do auth no fim do stream: quando o
	// estado vira pronto, esta tela já cumpriu o papel dela.
	if (state === "pronto") {
		return <Navigate to="/publicacoes" replace />;
	}

	if (state === "sincronizando") {
		return <ComecarProgresso />;
	}

	if (state === "falhou") {
		return <ComecarFalha />;
	}

	return <ComecarConvite />;
}
