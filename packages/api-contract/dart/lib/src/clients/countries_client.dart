// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/country_list_envelope.dart';
import '../models/country_waitlist_result_envelope.dart';
import '../models/join_country_waitlist_dto.dart';

part 'countries_client.g.dart';

@RestApi()
abstract class CountriesClient {
  factory CountriesClient(Dio dio, {String? baseUrl}) = _CountriesClient;

  /// Switched-on countries with their regions (states / provinces), calling code and currency
  @GET('/countries')
  Future<CountryListEnvelope> listCountries({
    @Extras() Map<String, dynamic>? extras,
  });

  /// "Tell me when LawBid opens in my country": an e-mail goes out by itself when the country is switched on
  @POST('/countries/waitlist')
  Future<CountryWaitlistResultEnvelope> joinCountryWaitlist({
    @Body() required JoinCountryWaitlistDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
