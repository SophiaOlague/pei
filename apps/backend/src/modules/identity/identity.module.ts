import { Module } from '@nestjs/common';
import { IdentityService} from './identity.service';
import { IdentityController,  MeController  } from './identity.controller';

@Module({
  providers: [IdentityService],
  controllers: [IdentityController, MeController]
})
export class IdentityModule {}
