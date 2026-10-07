import { ApiProperty } from '@nestjs/swagger';

/** Owner 2026-10-07: «$99 / ~~$149~~ month −33%» — the old price and the
 * computed percent. Null whenever the admin's switch is off or the old
 * price is not above today's (a discount never shows as a "plus"). */
export class PriceDiscountDto {
  @ApiProperty({ type: 'integer', description: 'Old price, struck through.' })
  compareAtCents!: number;
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 99 })
  percent!: number;
}
