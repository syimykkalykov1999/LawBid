// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/join_partner_dto.dart';
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

  /// Become a partner myself (program and self-enrolment on); returns the dashboard with my link
  @POST('/partners/me/join')
  Future<PartnerMeEnvelope> joinPartnerProgram({
    @Body() required JoinPartnerDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Accept the current partner rules (existing partners; termsAcceptedVersion was null)
  @POST('/partners/me/accept-terms')
  Future<PartnerMeEnvelope> acceptPartnerTerms({
    @Extras() Map<String, dynamic>? extras,
  });
}
