import { IsIn, IsString } from 'class-validator';
import { IsIdentifierForChannel } from './validators';

export class OtpRequestDto {
  @IsIn(['phone', 'email'])
  channel!: 'phone' | 'email';

  @IsString()
  @IsIdentifierForChannel('channel')
  identifier!: string;
}
