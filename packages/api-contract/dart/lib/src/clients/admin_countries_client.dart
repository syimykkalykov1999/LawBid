// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/add_country_region_dto.dart';
import '../models/bulk_countries_dto.dart';
import '../models/bulk_countries_result_envelope.dart';
import '../models/countries_admin_envelope.dart';
import '../models/country_admin_envelope.dart';
import '../models/country_region_admin_envelope.dart';
import '../models/country_region_admin_list_envelope.dart';
import '../models/update_country_dto.dart';
import '../models/update_country_region_dto.dart';
import '../models/update_country_settings_dto.dart';

part 'admin_countries_client.g.dart';

@RestApi()
abstract class AdminCountriesClient {
  factory AdminCountriesClient(Dio dio, {String? baseUrl}) =
      _AdminCountriesClient;

  /// Every country with its switch, regions, people and readiness
  @GET('/admin/countries')
  Future<CountriesAdminEnvelope> listAdminCountries({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Switch a country on or off (on needs at least one region). Off: no new sign-ups, profiles or cases there; people already there keep their accounts.
  @PATCH('/admin/countries/{code}')
  Future<CountryAdminEnvelope> updateAdminCountry({
    @Path('code') required String code,
    @Body() required UpdateCountryDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Owner only: switch every country (or the given ones) on or off at once; countries without regions stay off
  @POST('/admin/countries/bulk')
  Future<BulkCountriesResultEnvelope> bulkAdminCountries({
    @Body() required BulkCountriesDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Countries settings (waiting-list e-mails)
  @PUT('/admin/countries/settings')
  Future<CountriesAdminEnvelope> updateAdminCountrySettings({
    @Body() required UpdateCountrySettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A country’s regions (states / provinces)
  @GET('/admin/countries/{code}/regions')
  Future<CountryRegionAdminListEnvelope> listAdminCountryRegions({
    @Path('code') required String code,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add a region to a country (its code must be free in every country)
  @POST('/admin/countries/{code}/regions')
  Future<CountryRegionAdminEnvelope> addAdminCountryRegion({
    @Path('code') required String code,
    @Body() required AddCountryRegionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Switch a region on or off
  @PATCH('/admin/countries/{code}/regions/{region}')
  Future<CountryRegionAdminEnvelope> updateAdminCountryRegion({
    @Path('code') required String code,
    @Path('region') required String region,
    @Body() required UpdateCountryRegionDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
