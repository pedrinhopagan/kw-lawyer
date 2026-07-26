import { addDays } from "../deadlines/calendar.ts";
import { DJEN_HISTORY_START, type DjenWindow } from "../djen/client.ts";

const COLLECTION_WINDOW_DAYS = 30;

// Publicação com data retroativa entra depois do dia em que ela deveria ter saído. Recoletar dois
// dias já vistos é de graça: a ingestão é idempotente por external_id.
const COLLECTION_OVERLAP_DAYS = 2;

interface CollectionMark {
	collectedFrom: string;
	collectedThrough: string;
}

function backwardSlices(from: string, through: string) {
	const windows: DjenWindow[] = [];

	for (let end = through; end >= from; ) {
		const start = addDays(end, -(COLLECTION_WINDOW_DAYS - 1));
		const clamped = start < from ? from : start;

		windows.push({ from: clamped, through: end });
		end = addDays(clamped, -1);
	}

	return windows;
}

// Sem marca d'água, o histórico inteiro é fatiado do mais recente para o mais antigo: o painel
// enche primeiro pelo que a advogada precisa hoje. Com marca, a janela incremental vem antes, e o
// histórico que ficou faltando (sync interrompido no meio) continua sendo puxado para trás.
export function planCollectionWindows(input: { mark: CollectionMark | undefined; today: string }) {
	if (!input.mark) {
		return backwardSlices(DJEN_HISTORY_START, input.today);
	}

	const incremental = {
		from: addDays(input.mark.collectedThrough, -COLLECTION_OVERLAP_DAYS),
		through: input.today,
	};

	if (input.mark.collectedFrom <= DJEN_HISTORY_START) {
		return [incremental];
	}

	return [
		incremental,
		...backwardSlices(DJEN_HISTORY_START, addDays(input.mark.collectedFrom, -1)),
	];
}
