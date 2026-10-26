// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'referral_settings_dto.dart';
import 'response_meta_dto.dart';

part 'referral_settings_envelope.g.dart';

@JsonSerializable()
class ReferralSettingsEnvelope {
  const ReferralSettingsEnvelope({required this.data, this.meta});

  factory ReferralSettingsEnvelope.fromJson(Map<String, Object?> json) =>
      _$ReferralSettingsEnvelopeFromJson(json);

  final ReferralSettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ReferralSettingsEnvelopeToJson(this);
}
