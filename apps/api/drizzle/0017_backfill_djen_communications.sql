-- A aterrissagem crua só sabe guardar publicação do DJEN, e a 0018 derruba o `raw` de todo mundo:
-- se existir outra origem com payload, ela seria perdida sem volta.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "publications"
		WHERE "publications"."source" <> 'djen' AND "publications"."raw" IS NOT NULL
	) THEN
		RAISE EXCEPTION 'Existe publicação de origem diferente de djen com payload cru: a aterrissagem não cobre essa origem.';
	END IF;
END
$$;
--> statement-breakpoint
-- A projeção nasce com histórico: o `raw` já gravado vira a aterrissagem crua e é marcado como
-- projetado na versão 1 do projetor, senão a primeira subida reprojetaria a base inteira.
INSERT INTO "djen_communications" (
	"id",
	"external_id",
	"available_at",
	"payload",
	"payload_hash",
	"fetched_at",
	"projected_at",
	"projector_version"
)
SELECT
	gen_random_uuid(),
	"publications"."external_id",
	"publications"."available_at",
	"publications"."raw",
	md5("publications"."raw"::text),
	"publications"."created_at",
	now(),
	1
FROM "publications"
WHERE "publications"."source" = 'djen'
ON CONFLICT ("external_id") DO NOTHING;
--> statement-breakpoint
UPDATE "publications"
SET
	"source_id" = "djen_communications"."id",
	"normalizer_version" = 1,
	"active" = coalesce(("publications"."raw" ->> 'ativo')::boolean, true),
	"status" = "publications"."raw" ->> 'status',
	"cancel_reason" = nullif(btrim(coalesce("publications"."raw" ->> 'motivo_cancelamento', '')), ''),
	"canceled_at" = CASE
		WHEN "publications"."raw" ->> 'data_cancelamento' ~ '^\d{4}-\d{2}-\d{2}'
		THEN ("publications"."raw" ->> 'data_cancelamento')::timestamptz
	END,
	"communication_number" = "publications"."raw" ->> 'numeroComunicacao',
	"org_code" = "publications"."raw" ->> 'idOrgao',
	"djen_hash" = "publications"."raw" ->> 'hash'
FROM "djen_communications"
WHERE
	"djen_communications"."external_id" = "publications"."external_id"
	AND "publications"."source" = 'djen';
--> statement-breakpoint
-- Por qual inscrição a comunicação chegou está no próprio payload, não em quem a colecionou:
-- derivar isso de `publication_links` marcaria a intimação do sócio com a OAB de quem acompanha,
-- e entregaria o processo dele a qualquer um que passasse a acompanhar essa outra inscrição.
INSERT INTO "djen_communication_oabs" ("id", "communication_id", "oab_number", "oab_uf")
SELECT
	gen_random_uuid(),
	"inscricao"."communication_id",
	"inscricao"."oab_number",
	"inscricao"."oab_uf"
FROM (
	SELECT DISTINCT
		"publications"."source_id" AS "communication_id",
		regexp_replace(
			coalesce("destinatario" -> 'advogado' ->> 'numero_oab', ''), '\D', '', 'g'
		) AS "oab_number",
		upper(btrim(coalesce("destinatario" -> 'advogado' ->> 'uf_oab', ''))) AS "oab_uf"
	FROM "publications"
	CROSS JOIN LATERAL jsonb_array_elements(
		CASE
			WHEN jsonb_typeof("publications"."raw" -> 'destinatarioadvogados') = 'array'
			THEN "publications"."raw" -> 'destinatarioadvogados'
			ELSE '[]'::jsonb
		END
	) AS "destinatario"
	WHERE "publications"."source_id" IS NOT NULL
) AS "inscricao"
WHERE "inscricao"."oab_number" <> '' AND "inscricao"."oab_uf" ~ '^[A-Z]{2}$'
ON CONFLICT ("communication_id", "oab_number", "oab_uf") DO NOTHING;
