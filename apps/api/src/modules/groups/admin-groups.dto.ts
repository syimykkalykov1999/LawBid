import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { GroupMemberDto } from './groups.dto';

export class AdminGroupsQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Part of the title.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class AdminGroupIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AdminGroupMemberParamDto extends AdminGroupIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  userId!: string;
}

/** Admin: one group in the list. */
export class AdminGroupDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty()
  memberCount!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  ownerName!: string | null;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty()
  messageCount!: number;

  @ApiProperty()
  pollCount!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ type: Date, nullable: true })
  lastMessageAt!: Date | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  deletedAt!: Date | null;
}

export class AdminGroupDetailDto extends AdminGroupDto {
  @ApiProperty({ type: [GroupMemberDto] })
  members!: GroupMemberDto[];
}

export interface AdminGroupPage {
  items: AdminGroupDto[];
  nextCursor: string | null;
}
