-- O grau, o órgão julgador, o sistema, a data de ajuizamento e o sigilo são da instância, não do
-- processo: o que já estava gravado em `cases` vira a instância que a fonte tinha declarado, antes
-- da 0021 derrubar as colunas.
INSERT INTO "case_instances" (
	"id",
	"case_id",
	"grau",
	"org_judging_name",
	"org_judging_code",
	"system_name",
	"filed_at",
	"secrecy_level"
)
SELECT
	gen_random_uuid(),
	"cases"."id",
	"cases"."grau",
	"cases"."org_judging_name",
	"cases"."org_judging_code",
	"cases"."system_name",
	"cases"."filed_at",
	"cases"."secrecy_level"
FROM "cases"
WHERE "cases"."grau" IS NOT NULL
ON CONFLICT ("case_id", "grau") DO NOTHING;
--> statement-breakpoint
-- O movimento herda o grau da única instância que o processo tinha até aqui: sem isso a timeline
-- diria "instância desconhecida" para todo o histórico já coletado. Quem não tinha grau declarado
-- não ganha um aqui: fica nulo e o próximo enriquecimento preenche, porque a gravação do movimento
-- passou a completar o grau que estiver nulo.
UPDATE "movements"
SET "grau" = "case_instances"."grau"
FROM "case_instances"
WHERE
	"case_instances"."case_id" = "movements"."case_id"
	AND "movements"."source" = 'datajud'
	AND "movements"."grau" IS NULL;
