import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class BlockUserParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

/** A row of `GET /users/me/blocks` (OQ-028). */
export class BlockedUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['attorney', 'client'], enumName: 'PersonRole' })
  role!: 'attorney' | 'client';

  @ApiProperty({ type: String, nullable: true })
  username!: string | null;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty()
  blockedAt!: string;
}
