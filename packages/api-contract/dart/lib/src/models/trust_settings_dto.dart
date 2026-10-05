// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'trust_settings_dto.g.dart';

@JsonSerializable()
class TrustSettingsDto {
  const TrustSettingsDto({
    required this.minLevelBids,
    required this.minLevelPayments,
    required this.minLevelBadge,
    required this.payoutDelayDays,
    required this.payoutDelayUntilLevel,
    required this.autoHoldOnComplaint,
    required this.complaintsToSuspend,
    required this.complaintWindowDays,
    required this.autoHoldOnNameMismatch,
    required this.flagDuplicateClaims,
  });

  factory TrustSettingsDto.fromJson(Map<String, Object?> json) =>
      _$TrustSettingsDtoFromJson(json);

  final int minLevelBids;
  final int minLevelPayments;
  final int minLevelBadge;
  final int payoutDelayDays;
  final int payoutDelayUntilLevel;
  final bool autoHoldOnComplaint;
  final int complaintsToSuspend;
  final int complaintWindowDays;
  final bool autoHoldOnNameMismatch;
  final bool flagDuplicateClaims;

  Map<String, Object?> toJson() => _$TrustSettingsDtoToJson(this);
}
