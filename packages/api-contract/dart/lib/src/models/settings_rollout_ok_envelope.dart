// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'settings_rollout_ok_dto.dart';

part 'settings_rollout_ok_envelope.g.dart';

@JsonSerializable()
class SettingsRolloutOkEnvelope {
  const SettingsRolloutOkEnvelope({required this.data, this.meta});

  factory SettingsRolloutOkEnvelope.fromJson(Map<String, Object?> json) =>
      _$SettingsRolloutOkEnvelopeFromJson(json);

  final SettingsRolloutOkDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SettingsRolloutOkEnvelopeToJson(this);
}
