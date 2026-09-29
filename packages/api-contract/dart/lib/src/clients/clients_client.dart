// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/public_client_profile_envelope.dart';

part 'clients_client.g.dart';

@RestApi()
abstract class ClientsClient {
  factory ClientsClient(Dio dio, {String? baseUrl}) = _ClientsClient;

  /// Public client mini-profile (OQ-026)
  @GET('/clients/{username}')
  Future<PublicClientProfileEnvelope> getClientProfile({
    @Path('username') required String username,
    @Extras() Map<String, dynamic>? extras,
  });
}
