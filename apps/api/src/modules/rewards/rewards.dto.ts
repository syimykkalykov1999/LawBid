import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { REWARD_DEPARTMENTS, type RewardDepartment } from './rewards.rules';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2]|W(0[1-9]|[1-4]\d|5[0-3]))$/;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RewardDepartmentSettingsDto {
  @ApiProperty({ enum: REWARD_DEPARTMENTS }) key!: RewardDepartment;
  @ApiProperty() label!: string;
  @ApiProperty({ description: 'Take part in «Лучший сотрудник».' })
  enabled!: boolean;
  @ApiProperty({ description: 'The prize text, e.g. «Выходной день».' })
  prize!: string;
  @ApiProperty({
    description: 'Bonus in cents, paid with the next salary (0 = none).',
  })
  bonusCents!: number;
}

export class RewardsSettingsDto {
  @ApiProperty({
    description: 'Master switch (owner). Off = nothing is shown anywhere.',
  })
  enabled!: boolean;
  @ApiProperty({
    description: 'Give the prizes at the end of every period automatically.',
  })
  autoAward!: boolean;
  @ApiProperty({ enum: ['month', 'week'] }) period!: 'month' | 'week';
  @ApiProperty({ type: RewardDepartmentSettingsDto, isArray: true })
  departments!: RewardDepartmentSettingsDto[];
}

export class UpdateRewardDepartmentDto {
  @ApiProperty({ enum: REWARD_DEPARTMENTS })
  @IsIn(REWARD_DEPARTMENTS)
  key!: RewardDepartment;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  prize?: string;
  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  bonusCents?: number;
}

export class UpdateRewardsSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoAward?: boolean;
  @ApiPropertyOptional({ enum: ['month', 'week'] })
  @IsOptional()
  @IsIn(['month', 'week'])
  period?: 'month' | 'week';
  @ApiPropertyOptional({ type: UpdateRewardDepartmentDto, isArray: true })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => UpdateRewardDepartmentDto)
  departments?: UpdateRewardDepartmentDto[];
}

export class RewardPeriodQueryDto {
  @ApiPropertyOptional({
    example: '2026-10',
    description: '"2026-10" or "2026-W41"; default = the current period.',
  })
  @IsOptional()
  @Matches(PERIOD)
  period?: string;
}

export class RewardMetricDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiPropertyOptional({ nullable: true }) value!: number | null;
}

export class RewardAwardDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() period!: string;
  @ApiProperty({ enum: REWARD_DEPARTMENTS }) department!: RewardDepartment;
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() rank!: number;
  @ApiProperty() score!: number;
  @ApiProperty() prize!: string;
  @ApiProperty() bonusCents!: number;
  @ApiProperty() currency!: string;
  @ApiProperty({ description: 'The bonus is on payroll (Деньги → Зарплаты).' })
  onPayroll!: boolean;
  @ApiProperty() auto!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class RewardLeaderRowDto {
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() rank!: number;
  @ApiProperty() score!: number;
  @ApiProperty({ type: RewardMetricDto, isArray: true })
  metrics!: RewardMetricDto[];
}

export class RewardDepartmentBoardDto {
  @ApiProperty({ enum: REWARD_DEPARTMENTS }) key!: RewardDepartment;
  @ApiProperty() label!: string;
  @ApiProperty() prize!: string;
  @ApiProperty() bonusCents!: number;
  @ApiProperty({ description: 'People in the department (with the right).' })
  members!: number;
  @ApiProperty({ type: RewardLeaderRowDto, isArray: true })
  rows!: RewardLeaderRowDto[];
  @ApiPropertyOptional({ type: RewardAwardDto, nullable: true })
  award!: RewardAwardDto | null;
}

export class RewardLeaderboardDto {
  @ApiProperty() period!: string;
  @ApiProperty({ format: 'date-time' }) from!: string;
  @ApiProperty({ format: 'date-time' }) to!: string;
  @ApiProperty({ description: 'The period is over (prizes can be given).' })
  closed!: boolean;
  @ApiProperty({ type: RewardDepartmentBoardDto, isArray: true })
  departments!: RewardDepartmentBoardDto[];
}

export class CreateRewardAwardDto {
  @ApiProperty({ example: '2026-10' }) @Matches(PERIOD) period!: string;
  @ApiProperty({ enum: REWARD_DEPARTMENTS })
  @IsIn(REWARD_DEPARTMENTS)
  department!: RewardDepartment;
  @ApiProperty({ format: 'uuid' }) @IsUUID('all') adminId!: string;
  @ApiPropertyOptional({
    maxLength: 200,
    description: 'Default: the department prize.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  prize?: string;
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 1_000_000,
    description: 'Default: the department bonus.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  bonusCents?: number;
}

export class RewardAwardIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('all') id!: string;
}

export class MyRewardRankDto {
  @ApiProperty({ enum: REWARD_DEPARTMENTS }) department!: RewardDepartment;
  @ApiProperty() label!: string;
  @ApiPropertyOptional({ nullable: true, description: 'null = no points yet.' })
  rank!: number | null;
  @ApiProperty() score!: number;
  @ApiProperty({ description: 'People ranked in the department.' }) of!: number;
  @ApiProperty() prize!: string;
  @ApiPropertyOptional({ nullable: true }) leaderName!: string | null;
}

export class MyRewardsDto {
  @ApiProperty({ description: 'false = the section does not exist for staff.' })
  enabled!: boolean;
  @ApiPropertyOptional({ nullable: true }) period!: string | null;
  @ApiProperty({ type: MyRewardRankDto, isArray: true })
  ranks!: MyRewardRankDto[];
  @ApiProperty({
    type: RewardAwardDto,
    isArray: true,
    description: 'My latest prizes.',
  })
  awards!: RewardAwardDto[];
}
