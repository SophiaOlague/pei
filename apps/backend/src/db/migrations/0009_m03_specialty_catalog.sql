-- ============================================================
-- PEI — M03 B1: catálogo de especialidades (D-5, D-26, D-33, D-34, R-4, Z-2; plan v2 §3, 0009).
-- Generada con drizzle-kit; agregado a mano solo el catálogo inicial (D-34) al final.
-- Los triggers de DELETE/TRUNCATE y de `code` inmutable llegan con 0012 (B3).
-- Reversible con DROP TABLE "specialty" mientras ninguna fila la referencie (antes de 0011).
-- NO APLICADA: requiere revisión del archivo (sha256), ensayo BEGIN … ROLLBACK y autorización (PC-B1).
-- ============================================================
CREATE TABLE "specialty" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "specialty_code_unique" UNIQUE("code"),
	CONSTRAINT "specialty_code_format_chk" CHECK ("specialty"."code" ~ '^[a-z][a-z0-9_]{1,49}$'),
	CONSTRAINT "specialty_name_chk" CHECK (char_length(btrim("specialty"."name")) BETWEEN 1 AND 100),
	CONSTRAINT "specialty_active_chk" CHECK (("specialty"."is_active" AND "specialty"."deactivated_at" IS NULL) OR (NOT "specialty"."is_active" AND "specialty"."deactivated_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "specialty_name_lower_uq" ON "specialty" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "specialty_active_idx" ON "specialty" USING btree ("is_active");--> statement-breakpoint
-- Agregado a mano: catálogo inicial (D-34)
INSERT INTO "specialty" ("code", "name") VALUES
  ('infectologia', 'Infectología'),
  ('psicologia', 'Psicología'),
  ('medicina_general', 'Medicina general');
