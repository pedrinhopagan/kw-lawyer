import { type } from "arktype";
import { AppealManager } from "../features/appeals/manager.ts";
import { synced } from "../orpc.ts";

export const appealsRouter = {
	byCase: synced
		.input(type({ "+": "delete", cnjNumber: "string > 0" }))
		.handler(({ input, context }) =>
			new AppealManager(context.db).byCase({ ...input, lawyerId: context.lawyer.id }),
		),

	choose: synced
		.input(
			type({
				"+": "delete",
				decisionId: "string.uuid",
				choice: type.enumerated("recorrer", "nao_recorrer", "recorrido"),
				"actKey?": "string <= 60",
				"reason?": type("string <= 500").or("null"),
			}),
		)
		.handler(({ input, context }) =>
			new AppealManager(context.db).choose({ ...input, lawyerId: context.lawyer.id }),
		),
};
