import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
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
 */
@ApiExcludeController()
@Controller('internal/alarm-events')
export class AlarmEventsController {
  constructor(private readonly incidents: IncidentsService) {}

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
    return { result };
  }
}
