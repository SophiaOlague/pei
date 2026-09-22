import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IdentityModule } from './modules/identity/identity.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // para no tener que importarlo en cada módulo
      envFilePath: '.env',
    }),
    IdentityModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
