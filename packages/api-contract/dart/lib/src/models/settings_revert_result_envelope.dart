// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'settings_revert_result_dto.dart';

part 'settings_revert_result_envelope.g.dart';

@JsonSerializable()
class SettingsRevertResultEnvelope {
  const SettingsRevertResultEnvelope({required this.data, this.meta});

  factory SettingsRevertResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$SettingsRevertResultEnvelopeFromJson(json);

  final SettingsRevertResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SettingsRevertResultEnvelopeToJson(this);
}
