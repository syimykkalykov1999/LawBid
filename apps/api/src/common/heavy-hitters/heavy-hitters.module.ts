import { Global, Module } from '@nestjs/common';
import { HeavyHittersService } from './heavy-hitters.service';

/** WP-G: Redis top-K of the heaviest users and cases (admin «Масштаб»). */
@Global()
@Module({
  providers: [HeavyHittersService],
  exports: [HeavyHittersService],
})
export class HeavyHittersModule {}
