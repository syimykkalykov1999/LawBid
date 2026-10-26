import { ApiProperty } from '@nestjs/swagger';
import { BadgesDto } from '../notifications/notifications-api.dto';
import { MeDto } from '../users/users.public';
import { ClientTimingsDto } from '../../common/dto/client-timings.dto';

/**
 * Owner 2026-10-22 (client economy plan, package G): everything the app
 * needs at start in ONE answer — instead of /users/me + /badges +
 * /config/bootstrap flags + support unread + /calls/ongoing. Cheap ETag:
 * a 304 costs a few indexed reads and no body.
 */
export class AppSessionDto {
  @ApiProperty({ type: MeDto })
  me!: MeDto;

  @ApiProperty({ type: BadgesDto })
  badges!: BadgesDto;

  @ApiProperty({
    description:
      'The server config version (flags, app_config, legal documents). When it differs from the one you stored, re-read GET /config/bootstrap.',
  })
  bootstrapVersion!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'boolean' },
    description: 'The same gated flags GET /config/bootstrap answers.',
  })
  flags!: Record<string, boolean>;

  @ApiProperty({
    type: 'integer',
    description: 'Support tickets with an unread answer from the team.',
  })
  unreadSupport!: number;

  @ApiProperty({
    description:
      'A call is running now in one of my groups — only then ask GET /calls/ongoing.',
  })
  hasOngoingCalls!: boolean;

  @ApiProperty({
    type: ClientTimingsDto,
    description:
      'The same `client.timings` GET /config/bootstrap answers (connection timings).',
  })
  client!: ClientTimingsDto;
}
