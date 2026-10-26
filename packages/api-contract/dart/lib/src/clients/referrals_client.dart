// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/apply_referral_dto.dart';
import '../models/apply_referral_result_envelope.dart';
import '../models/referral_me_envelope.dart';

part 'referrals_client.g.dart';

@RestApi()
abstract class ReferralsClient {
  factory ReferralsClient(Dio dio, {String? baseUrl}) = _ReferralsClient;

  /// My referral code, share link, invite counts and rewards
  @GET('/referrals/me')
  Future<ReferralMeEnvelope> getMyReferrals({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Enter a friend's code (once, within the sign-up window, not your own)
  @POST('/referrals/apply')
  Future<ApplyReferralResultEnvelope> applyReferral({
    @Body() required ApplyReferralDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
