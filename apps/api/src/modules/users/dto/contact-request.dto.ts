import { IsIn, IsString, MaxLength } from 'class-validator';
import { IsIdentifierForChannel } from '../../auth/dto/validators';

export class ContactRequestDto {
  @IsIn(['phone', 'email'])
  type!: 'phone' | 'email';

  @IsString()
  @IsIdentifierForChannel('type')
  @MaxLength(254)
  value!: string;
}
