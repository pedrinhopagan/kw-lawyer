import { Glob } from "bun";
import { expect, test } from "bun:test";

const API_SRC = new URL("../../api/src/", import.meta.url).pathname;

// Ler o painel não pode tocar o governo. Só quem sincroniza (e quem descobre o nome de quem chega,
// pelo DJEN) tem direito de abrir conexão com o CNJ.
const ALLOWED_PREFIXES = [
	"features/sync/",
	"features/projection/",
	"features/auth/",
	"features/oabs/",
];

const CONSTRUCTION = /new\s+(?:DjenClient|DatajudClient)\s*\(/u;

test("cliente do governo só é construído nos módulos que têm direito", async () => {
	const offenders: string[] = [];

	for await (const relative of new Glob("**/*.ts").scan(API_SRC)) {
		if (ALLOWED_PREFIXES.some((prefix) => relative.startsWith(prefix))) {
			continue;
		}

		const lines = (await Bun.file(`${API_SRC}${relative}`).text()).split("\n");

		for (const [index, line] of lines.entries()) {
			if (CONSTRUCTION.test(line)) {
				offenders.push(`src/${relative}:${index + 1}: ${line.trim()}`);
			}
		}
	}

	expect(offenders).toEqual([]);
});
