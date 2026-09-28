import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { CasesController } from './cases.controller';
import { CaseStateMachine } from './domain/case-state-machine';
import { CaseAccessPolicy } from './policies/case-access.policy';

/** Stage 1.7 stub controller (see CasesController, replaced in 4.2) plus
 * the stage 4.1 case lifecycle machine and access policy. */
@Module({
  imports: [UsersModule],
  controllers: [CasesController],
  providers: [CaseStateMachine, CaseAccessPolicy],
  exports: [CaseStateMachine, CaseAccessPolicy],
})
export class CasesModule {}
