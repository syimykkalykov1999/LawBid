import { IsIn, IsString, Matches } from 'class-validator';
import { IsIdentifierForChannel } from '../../auth/dto/validators';

export class ContactVerifyDto {
  @IsIn(['phone', 'email'])
  type!: 'phone' | 'email';

  @IsString()
  @IsIdentifierForChannel('type')
  value!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code!: string;
}
