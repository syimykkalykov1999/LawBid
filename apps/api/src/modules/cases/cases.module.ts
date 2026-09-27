import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { CasesController } from './cases.controller';

/** Stage 1.7 stub (see CasesController); file 04 fills this module in. */
@Module({
  imports: [UsersModule],
  controllers: [CasesController],
})
export class CasesModule {}
