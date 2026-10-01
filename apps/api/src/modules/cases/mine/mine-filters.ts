import { ApiPropertyOptional } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

/** Owner 2026-09-30: "Mine" lists grow long — search by title and filter
 * by qualification (a category includes its subcategories) and state. */
export class MineFilterFields {
  @ApiPropertyOptional({ description: 'Words of the case title.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ example: 'civil_litigation' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_.]{2,120}$/)
  practice?: string;

  @ApiPropertyOptional({ example: 'IL' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;
}

export function hasMineFilter(f: MineFilterFields): boolean {
  return !!(f.q || f.practice || f.state);
}

/** The case conditions of [f] (empty when no filter). */
export function mineCaseWhere(f: MineFilterFields): Prisma.CaseWhereInput {
  const words = (f.q ?? '').split(/\s+/).filter((w) => w.length > 0);
  return {
    ...(words.length
      ? {
          AND: words.map((w) => ({
            title: { contains: w, mode: 'insensitive' as const },
          })),
        }
      : {}),
    ...(f.practice
      ? {
          practice_area: {
            OR: [
              { code: f.practice },
              { code: { startsWith: `${f.practice}.` } },
            ],
          },
        }
      : {}),
    ...(f.state
      ? { states: { some: { state_code: f.state.toUpperCase() } } }
      : {}),
  };
}
