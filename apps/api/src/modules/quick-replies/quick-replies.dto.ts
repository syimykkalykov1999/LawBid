import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class QuickReplyParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class QuickReplyInputDto {
  @ApiProperty({ maxLength: 60, description: 'Short name in the picker.' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  title!: string;

  @ApiProperty({ maxLength: 1000, description: 'Text put into the composer.' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body!: string;
}

export class QuickReplyDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  body!: string;
}

export class QuickReplyListDto {
  @ApiProperty({ type: [QuickReplyDto] })
  items!: QuickReplyDto[];
}
