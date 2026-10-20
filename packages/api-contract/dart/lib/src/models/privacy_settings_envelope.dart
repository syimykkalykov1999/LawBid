// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'privacy_settings_dto.dart';
import 'response_meta_dto.dart';

part 'privacy_settings_envelope.g.dart';

@JsonSerializable()
class PrivacySettingsEnvelope {
  const PrivacySettingsEnvelope({required this.data, this.meta});

  factory PrivacySettingsEnvelope.fromJson(Map<String, Object?> json) =>
      _$PrivacySettingsEnvelopeFromJson(json);

  final PrivacySettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PrivacySettingsEnvelopeToJson(this);
}
