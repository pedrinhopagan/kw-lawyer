import type { PushPayload } from "./push.ts";

// A notificação atravessa os servidores de push da Apple e da Google e aparece na tela bloqueada do
// celular. Nenhum texto daqui carrega CNJ, nome de parte ou trecho de publicação: o detalhe vive
// atrás do gate de acesso e do login, alcançado pela url do clique.
export interface DeadlineAlertCounts {
	overdue: number;
	today: number;
	tomorrow: number;
	inThreeDays: number;
}

function plural(count: number, one: string, many: string) {
	if (count === 1) {
		return `1 ${one}`;
	}

	return `${count} ${many}`;
}

export function publicationsAlert(count: number): PushPayload | null {
	if (count < 1) {
		return null;
	}

	return {
		title: "Publicação nova",
		body: `${plural(count, "publicação nova", "publicações novas")} na sua inbox.`,
		url: "/publicacoes",
		tag: "kw-lawyer-publicacoes",
	};
}

export function deadlinesAlert(
	counts: DeadlineAlertCounts,
	singleDeadlineId: string | null,
): PushPayload | null {
	const segments = [
		counts.overdue > 0 && plural(counts.overdue, "prazo vencido", "prazos vencidos"),
		counts.today > 0 && `${plural(counts.today, "prazo vence", "prazos vencem")} hoje`,
		counts.tomorrow > 0 && `${plural(counts.tomorrow, "prazo vence", "prazos vencem")} amanhã`,
		counts.inThreeDays > 0 &&
			`${plural(counts.inThreeDays, "prazo vence", "prazos vencem")} em três dias`,
	].filter((segment): segment is string => !!segment);

	if (!segments.length) {
		return null;
	}

	return {
		title: counts.overdue > 0 ? "Prazo vencido sem cumprir" : "Prazo chegando",
		body: `${segments.join("; ")}.`,
		url: singleDeadlineId ? `/prazos/${singleDeadlineId}` : "/agenda",
		tag: "kw-lawyer-prazos",
	};
}

export function collectionFailureAlert(): PushPayload {
	return {
		title: "A coleta automática falhou",
		body: "Os dois últimos ciclos não terminaram. Abra o app e sincronize à mão.",
		url: "/configuracoes",
		tag: "kw-lawyer-coleta",
	};
}
