import { Module } from '@nestjs/common';
import { AccountBansService } from './account-bans.service';

@Module({ providers: [AccountBansService], exports: [AccountBansService] })
export class AccountBansModule {}
