import { randomUUID } from 'node:crypto';
import { Body, Controller, Post, UseInterceptors } from '@nestjs/common';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import { DevEchoDto } from './dev-echo.dto';

/**
 * Dev-only harness for stage 1.2's acceptance criteria (docs/01_FOUNDATION_AUTH.md
 * §15): "e2e-тест: ошибка валидации возвращает формат из раздела 7; повтор
 * запроса с тем же Idempotency-Key возвращает тот же ответ." No feature
 * endpoint exists yet to exercise ValidationPipe/IdempotencyInterceptor
 * against, so this stub proves the plumbing rather than a business rule.
 * Registered only when NODE_ENV=development (see dev.module.ts) — never
 * shipped to staging/production.
 */
@Controller('dev/echo')
export class DevEchoController {
  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  echo(@Body() dto: DevEchoDto) {
    return {
      echoedAt: new Date().toISOString(),
      receivedId: randomUUID(),
      ...dto,
    };
  }
}
