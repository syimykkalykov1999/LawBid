// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'public_seo_settings_dto.dart';
import 'response_meta_dto.dart';

part 'public_seo_settings_envelope.g.dart';

@JsonSerializable()
class PublicSeoSettingsEnvelope {
  const PublicSeoSettingsEnvelope({required this.data, this.meta});

  factory PublicSeoSettingsEnvelope.fromJson(Map<String, Object?> json) =>
      _$PublicSeoSettingsEnvelopeFromJson(json);

  final PublicSeoSettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PublicSeoSettingsEnvelopeToJson(this);
}
