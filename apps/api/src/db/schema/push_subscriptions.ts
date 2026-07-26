import { bigint, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { lawyers } from "./lawyers.ts";

export const pushSubscriptions = pgTable(
	"push_subscriptions",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		lawyerId: uuid("lawyer_id")
			.notNull()
			.references(() => lawyers.id, { onDelete: "cascade" }),
		endpoint: text("endpoint").notNull(),
		p256dh: text("p256dh").notNull(),
		auth: text("auth").notNull(),
		expirationTime: bigint("expiration_time", { mode: "number" }),
		userAgent: text("user_agent"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	// O mesmo navegador atende mais de um advogado, então a assinatura é do par e não do endpoint
	// sozinho: com a chave antiga, entrar como o segundo advogado tomava o push do primeiro e o
	// aparelho parava de avisar prazo dele sem nenhum aviso.
	(table) => [
		index("push_subscriptions_lawyer_idx").on(table.lawyerId),
		unique("push_subscriptions_lawyer_endpoint_key").on(table.lawyerId, table.endpoint),
	],
);
