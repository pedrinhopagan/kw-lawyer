import { differenceInCalendarDays } from "date-fns";
import { orpc, type RouterOutputs } from "@/lib/orpc";

export type SilentCase = RouterOutputs["radar"]["silent"]["items"][number];

export type UncoveredCase = RouterOutputs["radar"]["uncovered"]["items"][number];

export const silentCasesQueryOptions = orpc.radar.silent.queryOptions({ input: {} });

export const uncoveredCasesQueryOptions = orpc.radar.uncovered.queryOptions();

export const STATE_LABELS = {
	conclusao: "Concluso ao juiz",
	remetido: "Remetido à instância superior",
	redistribuido: "Redistribuído",
	tramitando: "Em tramitação",
	suspenso: "Suspenso",
	baixado: "Baixado",
} as const;

const UNCOVERED_LABELS = {
	sem_registro: "O DataJud não tem registro deste número",
	tribunal_nao_suportado: "O tribunal não publica no DataJud",
	falhou: "A consulta ao DataJud falhou",
} as const;

// A coleta consulta o DataJud duas vezes por dia, então dois dias sem resposta são quatro tentativas
// perdidas: o tribunal está fora do ar. Sem isso na tela, o "180 dias sem andamento" da linha seria
// uma conta sobre dado velho e a advogada não teria como saber.
const DATAJUD_STALE_DAYS = 2;

export function datajudStaleLabel(syncedAt: Date | string | null) {
	if (!syncedAt) {
		return "Nunca consultado no DataJud";
	}

	const days = differenceInCalendarDays(new Date(), new Date(syncedAt));

	if (days < DATAJUD_STALE_DAYS) {
		return null;
	}

	return `Sem resposta do DataJud há ${days} dias`;
}

export function uncoveredLabel(status: UncoveredCase["datajudStatus"]) {
	if (!status || status === "ok") {
		return "Ainda não consultado no DataJud";
	}

	return UNCOVERED_LABELS[status];
}
