// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'partner_client_rule.dart';
import 'partner_join_mode.dart';
import 'partner_texts_by_lang_dto.dart';

part 'partner_settings_dto.g.dart';

@JsonSerializable()
class PartnerSettingsDto {
  const PartnerSettingsDto({
    required this.enabled,
    required this.attorneyRateCents,
    required this.clientRateCents,
    required this.clientRule,
    required this.holdDays,
    required this.texts,
    this.joinMode,
    this.requireW9,
  });

  factory PartnerSettingsDto.fromJson(Map<String, Object?> json) =>
      _$PartnerSettingsDtoFromJson(json);

  final bool enabled;

  /// open: anyone joins at once; approval: requests wait for the admin; closed: only the admin adds partners. Omitted = keep the current mode.
  final PartnerJoinMode? joinMode;
  final int attorneyRateCents;
  final int clientRateCents;
  final PartnerClientRule clientRule;
  final int holdDays;

  /// Require a W-9 (or W-8) before the first payout. Omitted = keep the current value.
  final bool? requireW9;
  final PartnerTextsByLangDto texts;

  Map<String, Object?> toJson() => _$PartnerSettingsDtoToJson(this);
}
