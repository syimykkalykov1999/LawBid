import { IsIn, IsString } from 'class-validator';
import { IsIdentifierForChannel } from '../../auth/dto/validators';

export class ContactRequestDto {
  @IsIn(['phone', 'email'])
  type!: 'phone' | 'email';

  @IsString()
  @IsIdentifierForChannel('type')
  value!: string;
}
