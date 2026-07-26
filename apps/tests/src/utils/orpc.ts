import type { Db, Tx } from "@kw-lawyer/api/src/db/client.ts";
import type { SessionLawyer } from "@kw-lawyer/api/src/features/auth/session.ts";
import type { Context } from "@kw-lawyer/api/src/orpc.ts";
import { appRouter } from "@kw-lawyer/api/src/router.ts";
import { createRouterClient } from "@orpc/server";

export function createTestClient(
	db: Db | Tx,
	lawyer: SessionLawyer | null = null,
	deviceId: string = crypto.randomUUID(),
) {
	const context: Context = { session: lawyer ? { lawyer, deviceId } : null, access: true, db };

	return createRouterClient(appRouter, { context });
}

// O aparelho só importa para quem testa perfis: os testes de dado querem um advogado autenticado e
// cada um no seu device, senão duas sessões de teste vizinhas passariam a se enxergar no seletor.
export function testContext(
	db: Db | Tx,
	lawyer: SessionLawyer,
	deviceId: string = crypto.randomUUID(),
): Context {
	return { session: { lawyer, deviceId }, access: true, db };
}
