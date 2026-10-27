// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'desk_settings_dto.dart';
import 'response_meta_dto.dart';

part 'desk_settings_envelope.g.dart';

@JsonSerializable()
class DeskSettingsEnvelope {
  const DeskSettingsEnvelope({required this.data, this.meta});

  factory DeskSettingsEnvelope.fromJson(Map<String, Object?> json) =>
      _$DeskSettingsEnvelopeFromJson(json);

  final DeskSettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DeskSettingsEnvelopeToJson(this);
}
