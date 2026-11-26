// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'settings_rollout_dto.dart';

part 'settings_rollout_list_envelope.g.dart';

@JsonSerializable()
class SettingsRolloutListEnvelope {
  const SettingsRolloutListEnvelope({required this.data, this.meta});

  factory SettingsRolloutListEnvelope.fromJson(Map<String, Object?> json) =>
      _$SettingsRolloutListEnvelopeFromJson(json);

  final List<SettingsRolloutDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SettingsRolloutListEnvelopeToJson(this);
}
