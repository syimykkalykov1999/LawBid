import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class DeskHeartbeatDto {
  @ApiProperty({
    description:
      'true when the person moved the mouse or pressed a key in the last few minutes.',
  })
  @IsBoolean()
  active!: boolean;
}

export class DeskHeartbeatResultDto {
  @ApiProperty({
    enum: ['online', 'away', 'offline'],
    enumName: 'DeskPresence',
  })
  status!: string;
}
