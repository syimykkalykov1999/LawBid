// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/address_suggestions_envelope.dart';

part 'addresses_client.g.dart';

@RestApi()
abstract class AddressesClient {
  factory AddressesClient(Dio dio, {String? baseUrl}) = _AddressesClient;

  /// Address / place suggestions for what the person typed (address and city: US only; place: anywhere, in the app language). enabled=false: the field stays plain text.
  ///
  /// [q] - What the person typed so far. Fewer than 3 letters (2 for kind=place, after trimming) returns no suggestions without a provider call.
  ///
  /// [kind] - address (default): US street addresses; city: US cities only; place: venues, cities and addresses anywhere (post location).
  ///
  /// [session] - A random id the app makes when the field gets focus and keeps until an address is picked (Google bills one session instead of every key stroke).
  @GET('/addresses/suggest')
  Future<AddressSuggestionsEnvelope> suggestAddresses({
    @Query('q') required String q,
    @Query('kind') String? kind,
    @Query('session') String? session,
    @Extras() Map<String, dynamic>? extras,
  });
}
