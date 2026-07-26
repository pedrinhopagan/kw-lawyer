import { date, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { lawyers } from "./lawyers.ts";

export type NotificationTrigger = "publicacoes" | "prazos" | "coleta_falhou";

export const notificationSends = pgTable(
	"notification_sends",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		lawyerId: uuid("lawyer_id")
			.notNull()
			.references(() => lawyers.id, { onDelete: "cascade" }),
		trigger: text("trigger").$type<NotificationTrigger>().notNull(),
		day: date("day").notNull(),
		title: text("title").notNull(),
		body: text("body").notNull(),
		url: text("url").notNull(),
		delivered: integer("delivered").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	// A linha é o próprio controle de "um disparo por gatilho por dia": quem consegue inserir manda a
	// notificação, e uma segunda réplica da api que tentar no mesmo minuto bate no unique.
	(table) => [
		uniqueIndex("notification_sends_lawyer_trigger_day_unique").on(
			table.lawyerId,
			table.trigger,
			table.day,
		),
	],
);
