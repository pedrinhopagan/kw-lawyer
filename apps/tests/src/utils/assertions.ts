import { ORPCError } from "@orpc/server";
import { expect } from "bun:test";

export function assertDefined<T>(
	value: T | null | undefined,
	msg = "valor não definido",
): asserts value is T {
	if (value === null || value === undefined) throw new Error(msg);
}

// oxlint-disable-next-line no-explicit-any
type Constructor<T> = abstract new (...args: any) => T;

export function assertIsInstanceOf<T>(
	value: unknown,
	ctor: Constructor<T>,
	msg?: string,
): asserts value is T {
	if (!(value instanceof ctor)) {
		throw new Error(msg ?? `esperava instância de ${ctor.name}`);
	}
}

export async function expectOrpcError(promise: Promise<unknown>, code: string) {
	const rejection = await promise.then(
		() => null,
		(reason: unknown) => reason,
	);

	assertIsInstanceOf(rejection, ORPCError);
	expect(rejection.code).toBe(code);
}
