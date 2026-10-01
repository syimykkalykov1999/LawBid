import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/** Owner 2026-10-01: finish a sign-in that would end another device. */
export class ContinueLoginDto {
  @ApiProperty({ description: 'details.pendingToken of the 409 answer.' })
  @IsString()
  @Length(16, 100)
  pendingToken!: string;
}
