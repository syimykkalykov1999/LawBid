// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promotion_settings_dto.dart';
import 'response_meta_dto.dart';

part 'promotion_settings_envelope.g.dart';

@JsonSerializable()
class PromotionSettingsEnvelope {
  const PromotionSettingsEnvelope({required this.data, this.meta});

  factory PromotionSettingsEnvelope.fromJson(Map<String, Object?> json) =>
      _$PromotionSettingsEnvelopeFromJson(json);

  final PromotionSettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PromotionSettingsEnvelopeToJson(this);
}
