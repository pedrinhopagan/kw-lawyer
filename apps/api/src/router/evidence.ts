import { type } from "arktype";
import {
	EVIDENCE_KINDS,
	EVIDENCE_PRODUCERS,
	EVIDENCE_STAGES,
} from "../features/evidence/classify.ts";
import { EvidenceManager } from "../features/evidence/manager.ts";
import { synced } from "../orpc.ts";

export const evidenceRouter = {
	byCase: synced
		.input(type({ "+": "delete", cnjNumber: "string > 0" }))
		.handler(({ input, context }) =>
			new EvidenceManager(context.db).listByCase({ ...input, lawyerId: context.lawyer.id }),
		),

	correct: synced
		.input(
			type({
				"+": "delete",
				id: "string.uuid",
				"kind?": type.enumerated(...EVIDENCE_KINDS),
				"stage?": type.enumerated(...EVIDENCE_STAGES),
				"producedBy?": type.enumerated(...EVIDENCE_PRODUCERS),
				"note?": type("string <= 500").or("null"),
			}),
		)
		.handler(({ input, context }) =>
			new EvidenceManager(context.db).correct({ ...input, lawyerId: context.lawyer.id }),
		),

	dismiss: synced.input(type({ "+": "delete", id: "string.uuid" })).handler(({ input, context }) =>
		new EvidenceManager(context.db).setDismissed({
			...input,
			lawyerId: context.lawyer.id,
			dismissed: true,
		}),
	),

	restore: synced.input(type({ "+": "delete", id: "string.uuid" })).handler(({ input, context }) =>
		new EvidenceManager(context.db).setDismissed({
			...input,
			lawyerId: context.lawyer.id,
			dismissed: false,
		}),
	),
};
