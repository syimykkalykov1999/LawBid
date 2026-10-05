// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'storage_image_format.dart';

part 'update_storage_settings_dto.g.dart';

@JsonSerializable()
class UpdateStorageSettingsDto {
  const UpdateStorageSettingsDto({
    this.dedup,
    this.autoCleanup,
    this.orphanGraceHours,
    this.purgeAfterDays,
    this.deletedPostsMediaDays,
    this.imageFormat,
    this.userQuotaMb,
    this.chatQuotaMb,
    this.autoRetention,
    this.retentionAuthEventsDays,
    this.retentionAssistantActivityDays,
    this.notificationsRetentionDays,
    this.growthAlertPercent,
  });

  factory UpdateStorageSettingsDto.fromJson(Map<String, Object?> json) =>
      _$UpdateStorageSettingsDtoFromJson(json);

  final bool? dedup;
  final bool? autoCleanup;
  final num? orphanGraceHours;
  final num? purgeAfterDays;
  final num? deletedPostsMediaDays;
  final StorageImageFormat? imageFormat;
  final num? userQuotaMb;
  final num? chatQuotaMb;
  final bool? autoRetention;
  final num? retentionAuthEventsDays;
  final num? retentionAssistantActivityDays;
  final num? notificationsRetentionDays;
  final num? growthAlertPercent;

  Map<String, Object?> toJson() => _$UpdateStorageSettingsDtoToJson(this);
}
