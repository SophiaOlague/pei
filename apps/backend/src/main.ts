import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadAuthConfig } from './auth/auth.config';
import { corsOptionsFor } from './common/http/cors';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';
import { createValidationPipe } from './common/validation/create-validation-pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // Solo los orígenes web de AUTH_TRUSTED_ORIGINS reciben CORS con credenciales (common/http/cors.ts).
  app.enableCors(corsOptionsFor(loadAuthConfig().trustedOrigins));
  app.useGlobalFilters(new DomainExceptionFilter());
  app.useGlobalPipes(createValidationPipe());
  await app.listen(3000);
}
bootstrap();