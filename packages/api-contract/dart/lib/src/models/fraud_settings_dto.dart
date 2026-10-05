// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fraud_match_action.dart';

part 'fraud_settings_dto.g.dart';

@JsonSerializable()
class FraudSettingsDto {
  const FraudSettingsDto({
    required this.enabled,
    required this.auto,
    required this.matchAction,
    required this.deviceAction,
    required this.reviewScore,
    required this.restrictScore,
    required this.banScore,
    required this.weightFraudReport,
    required this.weightReport,
    required this.weightChargeback,
    required this.windowDays,
    required this.notifyStaff,
    required this.fingerprintRetentionDays,
    required this.blockedRetentionDays,
  });

  factory FraudSettingsDto.fromJson(Map<String, Object?> json) =>
      _$FraudSettingsDtoFromJson(json);

  /// Master switch.
  final bool enabled;

  /// Actions apply by themselves (off = queue only).
  final bool auto;
  final FraudMatchAction matchAction;
  final FraudMatchAction deviceAction;
  final num reviewScore;
  final num restrictScore;
  final num banScore;
  final num weightFraudReport;
  final num weightReport;
  final num weightChargeback;
  final num windowDays;
  final bool notifyStaff;
  final num fingerprintRetentionDays;
  final num blockedRetentionDays;

  Map<String, Object?> toJson() => _$FraudSettingsDtoToJson(this);
}
