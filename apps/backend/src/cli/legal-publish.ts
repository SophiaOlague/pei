// Plan v2 §6.4: publica nuevas versiones de documentos legales. Siempre en dos pasos: una simulación sin escrituras
// y una publicación con la confirmación que esa simulación imprime. La publicación es atómica, evalúa a ambos roles y
// no imprime el contenido de los documentos, URLs ni credenciales.
//
//   pnpm legal:publish --dry-run --audience doctor --target-branch br-… --target-endpoint ep-… \
//     --published-at 2026-11-01T06:00:00Z --doc doctor_terms@1=./terminos-medico.md
//   pnpm legal:publish --confirm <token> [mismos argumentos] [--accept-regime-transition]
//
// El destino declarado debe coincidir con la identidad que informa la BD. Otras banderas: --allow-production,
// --allow-provisional-production y --allow-past-date <motivo>. Publicar escribe en la BD configurada de forma permanente:
// requiere autorización y los textos aprobados.
import 'dotenv/config';
import { readFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { CliModule } from './cli.module';
import { PublishLegalDocumentsUseCase } from '../modules/identity/application/use-cases/legal-documents.use-cases';
import { DomainError } from '../common/domain/domain-error';
import { LegalPublishUsageError, parseLegalPublishArgs, validateLegalPublishArgs } from './legal-publish.args';
import { formatPublicationPlan } from './legal-publish.report';
import { db } from '../db';

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = validateLegalPublishArgs(parseLegalPublishArgs(argv));
  const request = {
    audience: args.audience,
    documents: args.docs.map((doc) => ({ type: doc.type, version: doc.version, content: readFileSync(doc.path, 'utf8') })),
    publishedAt: args.publishedAt,
    pastDateReason: args.pastDateReason ?? undefined,
    declaredTarget: { branch: args.targetBranch, endpoint: args.targetEndpoint },
  };

  const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn'] });
  try {
    const useCase = app.get(PublishLegalDocumentsUseCase);
    if (args.dryRun) {
      const { plan, confirmation } = await useCase.simulate(request);
      console.log(formatPublicationPlan(plan));
      console.log(`MODO SIMULACIÓN: solo lectura; no se autorizó ninguna escritura${plan.target.kind === 'production' ? ' en production' : ''}.`);
      console.log(`Confirmación: ${confirmation}`);
      return 0;
    }
    const { plan, published } = await useCase.execute({
      ...request,
      confirmation: args.confirm!,
      authorizations: {
        allowProduction: args.allowProduction,
        acceptRegimeTransition: args.acceptRegimeTransition,
        allowProvisionalInProduction: args.allowProvisionalProduction,
      },
    });
    console.log(formatPublicationPlan(plan));
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
      // Un error de infraestructura podría citar el host: solo se imprimen los mensajes propios.
      console.error(error instanceof DomainError || error instanceof LegalPublishUsageError ? error.message : 'Error de ejecución');
      process.exit(1);
    });
}
