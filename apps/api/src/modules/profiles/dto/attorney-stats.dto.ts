import { ApiProperty } from '@nestjs/swagger';

/** GET /attorneys/me/stats — the attorney's own numbers (owner 2026-10-14). */
export class AttorneyStatsDto {
  @ApiProperty({ type: 'integer', description: 'Profile opens, last 30 days' })
  profileViews30d!: number;
  @ApiProperty({ type: 'integer', description: 'Offers sent, last 30 days' })
  bidsSent30d!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Offers accepted, last 30 days',
  })
  bidsAccepted30d!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Clients who hired this attorney through LawBid, all time',
  })
  clientsTotal!: number;
}
