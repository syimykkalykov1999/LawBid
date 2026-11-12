import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Logger,
  Post,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AiAssistantService } from '../../../modules/ai-assistant/ai-assistant.service';
import { Public } from '../../../modules/auth/decorators/public.decorator';
import { IncidentsService } from './incidents.service';

export class AlarmEventDto {
  @IsString()
  @MaxLength(255)
  alarmName!: string;

  @IsIn(['ALARM', 'OK', 'INSUFFICIENT_DATA'])
  state!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsDateString()
  at?: string;
}

/** Constant-time comparison; an unset token refuses everything. */
export function tokenMatches(
  expected: string | undefined,
  given: string | undefined,
): boolean {
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * S12-14: the alarm-hook Lambda (infra/modules/monitoring/journey.tf) posts
 * every CloudWatch alarm state change here, with the shared internal token
 * (`ALARM_HOOK_TOKEN`, from Secrets Manager). Not part of the public API
 * contract. Without the env var set the route answers 403 to everyone.
 *
 * 12.11.2026 (owner: «реагировать сразу»): an ALARM also starts the AI
 * assistant (ai-assistant.yml, reason=alarm) through AiAssistantService.trigger
 * — its gate (switch, month ceiling) and a one-per-hour debounce per alarm
 * name. Fire and forget: the Lambda's 8 s timeout never waits on GitHub.
 * Resolved lazily (OpsModule is global and also runs in the worker, where the
 * AI module is absent).
 */
@ApiExcludeController()
@Controller('internal/alarm-events')
export class AlarmEventsController {
  private readonly log = new Logger(AlarmEventsController.name);

  constructor(
    private readonly incidents: IncidentsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private assistant(): AiAssistantService | null {
    try {
      return this.moduleRef.get(AiAssistantService, { strict: false });
    } catch {
      return null;
    }
  }

  // flag: none internal route (shared token, alarm-hook Lambda); AI run gated by ai.assistant_mode
  @Public()
  @Post()
  @HttpCode(200)
  async receive(
    @Headers('x-internal-token') token: string | undefined,
    @Body() dto: AlarmEventDto,
  ): Promise<{ result: string }> {
    if (!tokenMatches(process.env.ALARM_HOOK_TOKEN, token)) {
      throw new ForbiddenException();
    }
    const result = await this.incidents.recordAlarm(
      dto.alarmName,
      dto.state,
      dto.reason ?? '',
      dto.at ? new Date(dto.at) : new Date(),
    );
    if (dto.state === 'ALARM') {
      const ai = this.assistant();
      if (ai) {
        void ai
          .trigger('alarm', dto.alarmName, dto.alarmName)
          .catch((e: Error) => this.log.warn(`ai trigger: ${e.message}`));
      }
    }
    return { result };
  }
}
