// Plan v2 §6.4: publica nuevas versiones de documentos legales del régimen de un tipo de cuenta, en una sola
// transacción y con el mismo published_at. Después de publicar, el régimen nuevo del rol queda completo; una
// publicación parcial se rechaza y los tipos de legado (privacy_notice, terms_and_conditions) no se publican.
// No imprime el contenido de los documentos.
//
//   pnpm legal:publish --audience patient --doc privacy_policy@1=./aviso.md --doc patient_terms@1=./terminos.md
//   pnpm legal:publish --audience doctor  --doc doctor_terms@1=./terminos-medico.md [--published-at 2026-11-01T06:00:00Z]
//
// Escribe en la BD configurada (legal_document y audit_log): ejecutarlo requiere autorización y los textos aprobados.
import 'dotenv/config';
import { readFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { CliModule } from './cli.module';
import { PublishLegalDocumentsUseCase } from '../modules/identity/application/use-cases/legal-documents.use-cases';
import { LEGAL_AUDIENCES } from '../modules/identity/domain/legal-requirements';
import { parseLegalPublishArgs } from './legal-publish.args';
import { db } from '../db';

async function main(): Promise<number> {
  const args = parseLegalPublishArgs(process.argv.slice(2));
  const audience = LEGAL_AUDIENCES.find((candidate) => candidate === args.audience);
  if (!audience) throw new Error('--audience debe ser patient o doctor');
  const documents = args.docs.map((doc) => ({ type: doc.type, version: doc.version, content: readFileSync(doc.path, 'utf8') }));

  const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn'] });
  try {
    const published = await app
      .get(PublishLegalDocumentsUseCase)
      .execute({ audience, documents, publishedAt: args.publishedAt });
    for (const doc of published) console.log(`Publicado ${doc.type} versión ${doc.version} (${doc.publishedAt.toISOString()})`);
    return 0;
  } finally {
    await app.close();
    await db.$client.end();
  }
}

if (require.main === module) {
  void main()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error((error as Error)?.message ?? 'Error');
      process.exit(1);
    });
}
