// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/partner_me_envelope.dart';

part 'partners_client.g.dart';

@RestApi()
abstract class PartnersClient {
  factory PartnersClient(Dio dio, {String? baseUrl}) = _PartnersClient;

  /// My partner dashboard: link, rates, who joined, accrued and paid earnings (isPartner=false for everyone else)
  @GET('/partners/me')
  Future<PartnerMeEnvelope> getMyPartnerDashboard({
    @Extras() Map<String, dynamic>? extras,
  });
}
