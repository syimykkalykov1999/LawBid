import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const GROUP_SHARED_KINDS = ['media', 'files', 'links', 'voice'] as const;
export type GroupSharedKind = (typeof GROUP_SHARED_KINDS)[number];

/** Owner 2026-10-21 (Telegram): the tabs of a group's shared media. */
export class GroupSharedQueryDto {
  @ApiProperty({
    enum: GROUP_SHARED_KINDS,
    enumName: 'GroupSharedKind',
    description:
      'media = photos and videos · files = documents · links = messages with a link · voice = voice notes.',
  })
  @IsIn(GROUP_SHARED_KINDS)
  kind!: GroupSharedKind;

  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 60, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  limit?: number;
}
