import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { lawyers } from "./lawyers.ts";

export const sessions = pgTable(
	"sessions",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		lawyerId: uuid("lawyer_id")
			.notNull()
			.references(() => lawyers.id, { onDelete: "cascade" }),
		// O navegador guarda um id próprio e as sessões dele se agrupam por aqui. É o que autoriza
		// trocar de advogado sem OAB de novo: a permissão vem de uma entrada anterior feita neste
		// mesmo aparelho, nunca de um id de advogado que chegou pela requisição.
		deviceId: uuid("device_id").notNull(),
		token: text("token").notNull().unique(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	// Duas abas do mesmo navegador entrando com a mesma OAB ao mesmo tempo abririam duas sessões
	// vivas do par, e a troca de perfil escolheria uma delas sem critério, deixando a outra pendurada
	// até expirar. Quem impede isso é o banco, não a ordem das escritas da aplicação.
	(table) => [
		index("sessions_lawyer_idx").on(table.lawyerId),
		index("sessions_device_idx").on(table.deviceId),
		uniqueIndex("sessions_device_lawyer_open_idx")
			.on(table.deviceId, table.lawyerId)
			.where(sql`${table.revokedAt} is null`),
	],
);
