// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'attorney_ads_settings_dto.dart';
import 'response_meta_dto.dart';

part 'attorney_ads_settings_envelope.g.dart';

@JsonSerializable()
class AttorneyAdsSettingsEnvelope {
  const AttorneyAdsSettingsEnvelope({required this.data, this.meta});

  factory AttorneyAdsSettingsEnvelope.fromJson(Map<String, Object?> json) =>
      _$AttorneyAdsSettingsEnvelopeFromJson(json);

  final AttorneyAdsSettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AttorneyAdsSettingsEnvelopeToJson(this);
}
