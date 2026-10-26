// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'trust_settings_dto.dart';

part 'trust_settings_envelope.g.dart';

@JsonSerializable()
class TrustSettingsEnvelope {
  const TrustSettingsEnvelope({required this.data, this.meta});

  factory TrustSettingsEnvelope.fromJson(Map<String, Object?> json) =>
      _$TrustSettingsEnvelopeFromJson(json);

  final TrustSettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$TrustSettingsEnvelopeToJson(this);
}
