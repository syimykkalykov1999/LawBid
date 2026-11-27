import { Module } from '@nestjs/common';
import { RateLimitService } from '../auth/auth.public';
import {
  ADDRESS_PROVIDERS,
  AwsLocationAddressProvider,
  GooglePlacesAddressProvider,
  PhotonAddressProvider,
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
    PhotonAddressProvider,
    {
      provide: ADDRESS_PROVIDERS,
      useFactory: (
        aws: AwsLocationAddressProvider,
        google: GooglePlacesAddressProvider,
        photon: PhotonAddressProvider,
      ) => [aws, google, photon],
      inject: [
        AwsLocationAddressProvider,
        GooglePlacesAddressProvider,
        PhotonAddressProvider,
      ],
    },
  ],
})
export class AddressesModule {}
