// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'rewards_settings_dto.dart';

part 'rewards_settings_envelope.g.dart';

@JsonSerializable()
class RewardsSettingsEnvelope {
  const RewardsSettingsEnvelope({required this.data, this.meta});

  factory RewardsSettingsEnvelope.fromJson(Map<String, Object?> json) =>
      _$RewardsSettingsEnvelopeFromJson(json);

  final RewardsSettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$RewardsSettingsEnvelopeToJson(this);
}
