import { Global, Module } from '@nestjs/common';
import { SeoGeneratorTrigger } from './seo-generator.trigger';

/** Programmatic SEO: the event side of the `seo.generate` job. Global so the
 * code that publishes content needs no import (it calls
 * `notifySeoPagesChanged`); config, Redis and settings come from the global
 * modules. */
@Global()
@Module({
  providers: [SeoGeneratorTrigger],
  exports: [SeoGeneratorTrigger],
})
export class SeoGeneratorModule {}
