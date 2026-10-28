import { Module } from '@nestjs/common';
import { RateLimitService } from '../auth/auth.public';
import {
  ADDRESS_PROVIDERS,
  AwsLocationAddressProvider,
  GooglePlacesAddressProvider,
} from './address-providers';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';

/** Owner 2026-10-28: address suggestions (own limits, provider seam). */
@Module({
  controllers: [AddressesController],
  providers: [
    AddressesService,
    RateLimitService,
    AwsLocationAddressProvider,
    GooglePlacesAddressProvider,
    {
      provide: ADDRESS_PROVIDERS,
      useFactory: (
        aws: AwsLocationAddressProvider,
        google: GooglePlacesAddressProvider,
      ) => [aws, google],
      inject: [AwsLocationAddressProvider, GooglePlacesAddressProvider],
    },
  ],
})
export class AddressesModule {}
