import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { AssistantSelf } from '../auth/assistant/assistant-context';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { RealtimeEventLog } from './realtime-event-log';

export class MissedQueryDto {
  @ApiProperty({
    description:
      'The `seq` of the last realtime event the app saw (or of `realtime:ready`). 0 = nothing seen: the answer is `complete: false`.',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  since!: number;
}

export class MissedEventDto {
  @ApiProperty({
    description: 'Cursor of the event (increasing, not contiguous).',
  })
  seq!: number;

  @ApiProperty({ description: 'The realtime event name, e.g. message:new.' })
  event!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'The payload the socket event carried (including `seq`).',
  })
  data?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'true: the payload was too big to keep — refetch that screen.',
  })
  truncated?: boolean;
}

export class MissedEventsDto {
  @ApiProperty({ description: 'Newest cursor; continue from it.' })
  seq!: number;

  @ApiProperty({ type: [MissedEventDto] })
  events!: MissedEventDto[];

  @ApiProperty({
    description:
      'false: events are gone (gap over 5 minutes or over 200 events) — do one full refresh, then continue from `seq`.',
  })
  complete!: boolean;
}

/**
 * Owner 2026-10-23 (big platform architecture, part C2): the HTTP twin of
 * the socket call `sync:since` — what a reconnecting app (or one that
 * cannot hold a socket) asks once instead of re-reading ten lists.
 */
@ApiTags('realtime')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@AssistantSelf()
@Controller('realtime')
export class RealtimeController {
  constructor(private readonly log: RealtimeEventLog) {}

  @Get('missed')
  @ApiOperation({
    summary:
      'Realtime events missed since a cursor (last 5 minutes, at most 200)',
  })
  @ApiEnvelopeResponse(MissedEventsDto)
  async missed(
    @CurrentUser() user: RequestUser,
    @Query() q: MissedQueryDto,
  ): Promise<MissedEventsDto> {
    const ids = user.assistant ? [user.sub, user.assistant.userId] : [user.sub];
    return (await this.log.since(ids, q.since)) as MissedEventsDto;
  }
}
