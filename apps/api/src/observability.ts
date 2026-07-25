import { type BaseEvent, createObservability } from "@juicerq/trail/core";
import { sqliteStore } from "@juicerq/trail/sqlite";
import { env } from "./env.ts";

export interface AppEvent extends BaseEvent {
	type: "http" | "rpc" | "job";

	method?: string;
	path?: string;
	duration_ms?: number;

	procedure?: string;
	error_code?: string;
	error_message?: string;
	error_status?: number;

	input?: unknown;
	input_size?: number;
	user_id?: string;

	job_name?: string;
}

export const obs = createObservability<AppEvent>({
	service: "api",
	store: sqliteStore<AppEvent>({
		dbPath: env.OBSERVABILITY_DB_PATH,
		columns: {
			method: { type: "text" },
			path: { type: "text" },
			duration_ms: { type: "integer", index: true },
			procedure: { type: "text", index: true },
			error_code: { type: "text", index: true },
			user_id: { type: "text", index: true },
			job_name: { type: "text", index: true },
		},
		retention: {
			default: "3d",
			bySeverity: { warn: "30d", error: "90d" },
		},
	}),
});
