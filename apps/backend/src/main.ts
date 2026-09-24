import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.listen(3000);
}
bootstrap();