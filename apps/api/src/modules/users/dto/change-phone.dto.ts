import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

/** POST /users/me/phone — the new number in E.164 (owner rule
 * sms-two-cases: confirmed with the password / passkey, no SMS code). The
 * number type / country is checked by the service (the sign-up rule). */
export class ChangePhoneDto {
  @ApiProperty({ example: '+13125550123' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'phone must be E.164' })
  phone!: string;
}
