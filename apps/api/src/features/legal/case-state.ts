// Estado que o processo carrega hoje, lido dos movimentos tabelados do CNJ. Não é o mesmo que
// "parado": processo baixado terminou e processo suspenso está parado por decisão, então nenhum dos
// dois é risco de omissão.
export type CaseState =
	| "conclusao"
	| "suspenso"
	| "baixado"
	| "remetido"
	| "redistribuido"
	| "tramitando";

export interface CaseStateMovement {
	summary: string;
	occurredAt: Date;
}

const STATE_PATTERNS: { state: Exclude<CaseState, "tramitando">; pattern: RegExp }[] = [
	{ state: "baixado", pattern: /baixa definitiva|arquivamento definitivo|transitou em julgado/iu },
	{ state: "suspenso", pattern: /\bsuspens|sobrest/iu },
	{ state: "conclusao", pattern: /\bconclus[ãa]o\b/iu },
	{ state: "remetido", pattern: /\bremessa\b|\bremetido\b/iu },
	{ state: "redistribuido", pattern: /redistribu/iu },
];

export function classifyMovement(summary: string): CaseState {
	const found = STATE_PATTERNS.find((candidate) => candidate.pattern.test(summary));

	if (!found) {
		return "tramitando";
	}

	return found.state;
}

// O último movimento não é o estado: juntada de petição depois de uma conclusão não desfaz a
// conclusão. O estado é o movimento mais recente que muda de estado, e a data dele é desde quando.
export function stateOf(movements: CaseStateMovement[]) {
	for (const movement of movements) {
		const state = classifyMovement(movement.summary);

		if (state !== "tramitando") {
			return { state, since: movement.occurredAt };
		}
	}

	const latest = movements[0];

	return { state: "tramitando" as const, since: latest ? latest.occurredAt : null };
}

// Processo baixado terminou e processo suspenso está parado por decisão: nenhum dos dois é omissão,
// e é por esta lista que o radar recorta em SQL antes de limitar os candidatos.
export const SILENCE_SAFE_STATES: CaseState[] = ["baixado", "suspenso"];
