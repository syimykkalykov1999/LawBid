import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { loadConfig } from './configuration';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true, // ConfigService is already global from this; no need to also export it below
      load: [loadConfig],
      // loadConfig() already throws on invalid env, so this just wires it
      // into Nest's ConfigService rather than re-validating.
    }),
  ],
  exports: [NestConfigModule],
})
export class ConfigModule {}
