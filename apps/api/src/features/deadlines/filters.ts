import { and, eq, gte, ilike, inArray, lte, ne, or } from "drizzle-orm";
import { cases } from "../../db/schema/cases.ts";
import {
	type DeadlineAudience,
	type DeadlineConfidence,
	type DeadlineOrigin,
	type DeadlineStatus,
	deadlines,
} from "../../db/schema/deadlines.ts";

export const DEADLINE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export const OPEN_STATUSES: DeadlineStatus[] = ["pendente"];

export const CLOSED_STATUSES: DeadlineStatus[] = ["cumprido", "descartado"];

export const THIRD_PARTY_AUDIENCE: DeadlineAudience = "terceiro";

export const deadlineFilterFields = {
	"from?": DEADLINE_DATE_PATTERN,
	"to?": DEADLINE_DATE_PATTERN,
	"status?": "('pendente' | 'cumprido' | 'descartado')[]",
	"audience?": "('partes' | 'terceiro' | 'indefinido')[]",
	"confidence?": "('alta' | 'media' | 'baixa')[]",
	"origin?": "('automatico' | 'manual')[]",
	"actKeys?": "string[]",
	"tribunals?": "string[]",
	"query?": "string <= 200",
	"actionable?": "boolean",
	"caseId?": "string.uuid",
	"includeHistory?": "boolean",
} as const;

export interface DeadlineFilters {
	from?: string;
	to?: string;
	status?: DeadlineStatus[];
	audience?: DeadlineAudience[];
	confidence?: DeadlineConfidence[];
	origin?: DeadlineOrigin[];
	actKeys?: string[];
	tribunals?: string[];
	query?: string;
	actionable?: boolean;
	caseId?: string;
	includeHistory?: boolean;
}

export interface DeadlineWhereParams {
	lawyerId: string;
	historyCutoffAt: string;
	filters: DeadlineFilters;
	allStatuses?: boolean;
}

function likePattern(value: string) {
	return `%${value.replaceAll(/[\\%_]/gu, (match) => `\\${match}`)}%`;
}

function statusCondition(params: DeadlineWhereParams) {
	if (params.allStatuses) {
		return;
	}

	return inArray(
		deadlines.status,
		params.filters.status?.length ? params.filters.status : OPEN_STATUSES,
	);
}

function floorCondition(params: DeadlineWhereParams) {
	if (params.filters.from) {
		return gte(deadlines.dueAt, params.filters.from);
	}

	if (params.filters.includeHistory) {
		return;
	}

	return gte(deadlines.dueAt, params.historyCutoffAt);
}

function searchCondition(query: string) {
	const digits = query.replaceAll(/\D/gu, "");

	return or(
		ilike(deadlines.title, likePattern(query)),
		ilike(deadlines.snippet, likePattern(query)),
		digits ? ilike(cases.cnjNumber, likePattern(digits)) : undefined,
	);
}

export function deadlineWhere(params: DeadlineWhereParams) {
	const query = params.filters.query?.trim();

	return and(
		eq(deadlines.lawyerId, params.lawyerId),
		params.filters.caseId ? eq(deadlines.caseId, params.filters.caseId) : undefined,
		floorCondition(params),
		params.filters.to ? lte(deadlines.dueAt, params.filters.to) : undefined,
		params.filters.audience?.length
			? inArray(deadlines.audience, params.filters.audience)
			: undefined,
		params.filters.confidence?.length
			? inArray(deadlines.confidence, params.filters.confidence)
			: undefined,
		params.filters.origin?.length ? inArray(deadlines.origin, params.filters.origin) : undefined,
		params.filters.actKeys?.length ? inArray(deadlines.actKey, params.filters.actKeys) : undefined,
		params.filters.tribunals?.length
			? inArray(cases.tribunal, params.filters.tribunals)
			: undefined,
		query ? searchCondition(query) : undefined,
		params.filters.actionable ? ne(deadlines.audience, THIRD_PARTY_AUDIENCE) : undefined,
		statusCondition(params),
	);
}
