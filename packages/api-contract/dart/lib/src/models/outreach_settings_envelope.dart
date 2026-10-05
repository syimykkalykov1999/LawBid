// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_settings_dto.dart';
import 'response_meta_dto.dart';

part 'outreach_settings_envelope.g.dart';

@JsonSerializable()
class OutreachSettingsEnvelope {
  const OutreachSettingsEnvelope({required this.data, this.meta});

  factory OutreachSettingsEnvelope.fromJson(Map<String, Object?> json) =>
      _$OutreachSettingsEnvelopeFromJson(json);

  final OutreachSettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$OutreachSettingsEnvelopeToJson(this);
}
