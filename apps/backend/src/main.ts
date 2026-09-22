import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableCors({
    origin: true, // ajusta esto a tus dominios de web/móvil cuando los tengas
    credentials: true,
  });
  await app.listen(3000);
}
bootstrap();
