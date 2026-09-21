import { IsInt, IsString, Min } from 'class-validator';

export class DevEchoDto {
  @IsString()
  message!: string;

  @IsInt()
  @Min(0)
  amountCents!: number;
}
