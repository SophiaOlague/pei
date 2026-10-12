import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IdentityModule } from './modules/identity/identity.module';
import { ConfigModule } from '@nestjs/config';
import * as bodyParser from 'body-parser';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { PrivateStorageModule } from './modules/private-storage/private-storage.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // para no tener que importarlo en cada módulo
      envFilePath: '.env',
    }),
    CommonModule,
    AuthModule,
    AuditModule,
    PrivateStorageModule,
    IdentityModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(bodyParser.json())
      .exclude({ path: 'api/auth/*path', method: RequestMethod.ALL })
      .forRoutes('*path');
  }
}
