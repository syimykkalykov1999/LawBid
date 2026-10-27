// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/promotion_dry_run_result_envelope.dart';
import '../models/promotion_overview_envelope.dart';
import '../models/promotion_setting_envelope.dart';
import '../models/update_config_dto.dart';

part 'admin_promotion_client.g.dart';

@RestApi()
abstract class AdminPromotionClient {
  factory AdminPromotionClient(Dio dio, {String? baseUrl}) =
      _AdminPromotionClient;

  /// SEO switches, channel checklist, last-build status from seo-manifest.json
  @GET('/admin/promotion')
  Future<PromotionOverviewEnvelope> promotionOverview({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Set one SEO switch or tick one checklist item (seo.* only)
  @PUT('/admin/promotion/settings/{key}')
  Future<PromotionSettingEnvelope> updatePromotionSetting({
    @Path('key') required String key,
    @Body() required UpdateConfigDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Start the SEO workflow as a dry run (publishes nothing), or return the command to run by hand
  @POST('/admin/promotion/dry-run')
  Future<PromotionDryRunResultEnvelope> startSeoDryRun({
    @Extras() Map<String, dynamic>? extras,
  });
}
