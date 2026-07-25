import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type {
	EvidenceConfidence,
	EvidenceKind,
	EvidenceProducer,
	EvidenceStage,
} from "../../features/evidence/classify.ts";
import { cases } from "./cases.ts";
import { movements } from "./movements.ts";
import { publications } from "./publications.ts";

export type CaseEvidenceOrigin = "automatico" | "manual";

export const caseEvidence = pgTable(
	"case_evidence",
	{
		id: uuid("id")
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		caseId: uuid("case_id")
			.notNull()
			.references(() => cases.id, { onDelete: "cascade" }),
		movementId: uuid("movement_id")
			.notNull()
			.unique()
			.references(() => movements.id, { onDelete: "cascade" }),
		publicationId: uuid("publication_id").references(() => publications.id, {
			onDelete: "set null",
		}),
		occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
		kind: text("kind").$type<EvidenceKind>().notNull(),
		stage: text("stage").$type<EvidenceStage>().notNull(),
		producedBy: text("produced_by").$type<EvidenceProducer>().notNull().default("indefinido"),
		title: text("title").notNull(),
		snippet: text("snippet").notNull(),
		confidence: text("confidence").$type<EvidenceConfidence>().notNull().default("baixa"),
		origin: text("origin").$type<CaseEvidenceOrigin>().notNull().default("automatico"),
		note: text("note"),
		dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
		engineVersion: integer("engine_version").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("case_evidence_case_occurred_idx").on(table.caseId, table.occurredAt.desc()),
		index("case_evidence_case_kind_idx").on(table.caseId, table.kind),
	],
);
