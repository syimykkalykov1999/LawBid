// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'partner_client_rule.dart';
import 'partner_texts_by_lang_dto.dart';

part 'partner_settings_dto.g.dart';

@JsonSerializable()
class PartnerSettingsDto {
  const PartnerSettingsDto({
    required this.enabled,
    required this.selfEnroll,
    required this.attorneyRateCents,
    required this.clientRateCents,
    required this.clientRule,
    required this.holdDays,
    required this.texts,
  });

  factory PartnerSettingsDto.fromJson(Map<String, Object?> json) =>
      _$PartnerSettingsDtoFromJson(json);

  final bool enabled;

  /// Users may join from the app by themselves.
  final bool selfEnroll;
  final int attorneyRateCents;
  final int clientRateCents;
  final PartnerClientRule clientRule;
  final int holdDays;
  final PartnerTextsByLangDto texts;

  Map<String, Object?> toJson() => _$PartnerSettingsDtoToJson(this);
}
