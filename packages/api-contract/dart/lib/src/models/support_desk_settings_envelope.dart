// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'support_desk_settings_dto.dart';

part 'support_desk_settings_envelope.g.dart';

@JsonSerializable()
class SupportDeskSettingsEnvelope {
  const SupportDeskSettingsEnvelope({required this.data, this.meta});

  factory SupportDeskSettingsEnvelope.fromJson(Map<String, Object?> json) =>
      _$SupportDeskSettingsEnvelopeFromJson(json);

  final SupportDeskSettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SupportDeskSettingsEnvelopeToJson(this);
}
