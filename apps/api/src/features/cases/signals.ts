import type { MovementComplement } from "../../db/schema/movements.ts";
import { type CaseState, classifyMovement } from "../legal/case-state.ts";

export const HEARING_MOVEMENT_CODE = "970";

const HEARING_SITUATION_COMPLEMENT = "situacao_da_audiencia";
const HEARING_TYPE_COMPLEMENT = "tipo_de_audiencia";

export type HearingSituation =
	| "designada"
	| "redesignada"
	| "cancelada"
	| "realizada"
	| "indefinida";

const HEARING_SITUATIONS: HearingSituation[] = [
	"designada",
	"redesignada",
	"cancelada",
	"realizada",
];

export interface CaseSignal {
	kind: Exclude<CaseState, "tramitando">;
	occurredAt: Date;
	summary: string;
}

export interface CaseHearing {
	situation: HearingSituation;
	type: string | null;
	registeredAt: Date;
	summary: string;
}

export interface SignalMovement {
	summary: string;
	occurredAt: Date;
	externalCode: string | null;
	complements: MovementComplement[] | null;
}

function complementNamed(complements: MovementComplement[] | null, description: string) {
	const found = complements?.find((complement) => complement.descricao === description);

	if (!found?.nome) {
		return null;
	}

	return found.nome;
}

function situationOf(complements: MovementComplement[] | null): HearingSituation {
	const raw = complementNamed(complements, HEARING_SITUATION_COMPLEMENT)?.toLowerCase();
	const found = HEARING_SITUATIONS.find((situation) => situation === raw);

	if (!found) {
		return "indefinida";
	}

	return found;
}

// O movimento 970 do CNJ diz que existe audiência e em que situação ela está, mas os complementos
// que o DataJud publica são só `situacao_da_audiencia`, `tipo_de_audiencia` e `dirigida_por`: a data
// da audiência não vem em nenhum deles, e `occurredAt` é quando o ato foi registrado, não quando ela
// acontece. Por isso aqui sai um sinal, não um compromisso com data: inventar a data para o Google
// Agenda colocaria a advogada no fórum no dia errado.
function hearingOf(movements: SignalMovement[]): CaseHearing | null {
	const found = movements.find((movement) => movement.externalCode === HEARING_MOVEMENT_CODE);

	if (!found) {
		return null;
	}

	return {
		situation: situationOf(found.complements),
		type: complementNamed(found.complements, HEARING_TYPE_COMPLEMENT),
		registeredAt: found.occurredAt,
		summary: found.summary,
	};
}

// Movimentos em ordem decrescente de data, como a timeline do processo já entrega. Um sinal por
// tipo, o mais recente de cada: a faixa responde "onde este processo está", não repete a timeline.
// O estado em si não sai daqui: ele é materializado pela varredura e lido da linha do processo.
export function signalsOf(movements: SignalMovement[]) {
	const seen = new Set<CaseSignal["kind"]>();
	const signals: CaseSignal[] = [];

	for (const movement of movements) {
		const kind = classifyMovement(movement.summary);

		if (kind === "tramitando" || seen.has(kind)) {
			continue;
		}

		seen.add(kind);
		signals.push({ kind, occurredAt: movement.occurredAt, summary: movement.summary });
	}

	return { signals, hearing: hearingOf(movements) };
}
