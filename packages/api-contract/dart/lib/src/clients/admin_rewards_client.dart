// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_reward_award_dto.dart';
import '../models/reward_award_envelope.dart';
import '../models/reward_award_list_envelope.dart';
import '../models/reward_leaderboard_envelope.dart';
import '../models/rewards_settings_envelope.dart';
import '../models/update_rewards_settings_dto.dart';

part 'admin_rewards_client.g.dart';

@RestApi()
abstract class AdminRewardsClient {
  factory AdminRewardsClient(Dio dio, {String? baseUrl}) = _AdminRewardsClient;

  /// Master switch, period, prize and bonus per department
  @GET('/admin/rewards/settings')
  Future<RewardsSettingsEnvelope> getRewardsSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Switch rewards on/off, period, prizes, bonuses
  @PUT('/admin/rewards/settings')
  Future<RewardsSettingsEnvelope> updateRewardsSettings({
    @Body() required UpdateRewardsSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Best employees per department for a period.
  ///
  /// [period] - "2026-10" or "2026-W41"; default = the current period.
  @GET('/admin/rewards/leaderboard')
  Future<RewardLeaderboardEnvelope> getRewardsLeaderboard({
    @Query('period') String? period,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Prizes given (latest first).
  ///
  /// [period] - "2026-10" or "2026-W41"; default = the current period.
  @GET('/admin/rewards/awards')
  Future<RewardAwardListEnvelope> listRewardAwards({
    @Query('period') String? period,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Give a prize; a bonus goes to Зарплаты as an accrual
  @POST('/admin/rewards/awards')
  Future<RewardAwardEnvelope> createRewardAward({
    @Body() required CreateRewardAwardDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Take a prize back (an unpaid bonus is canceled)
  @DELETE('/admin/rewards/awards/{id}')
  Future<void> deleteRewardAward({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
