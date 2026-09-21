import { Module } from '@nestjs/common';
import { DevEchoController } from './dev-echo.controller';

@Module({
  controllers: [DevEchoController],
})
export class DevModule {}
