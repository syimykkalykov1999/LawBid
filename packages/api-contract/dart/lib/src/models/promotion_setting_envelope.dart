// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promotion_setting_dto.dart';
import 'response_meta_dto.dart';

part 'promotion_setting_envelope.g.dart';

@JsonSerializable()
class PromotionSettingEnvelope {
  const PromotionSettingEnvelope({required this.data, this.meta});

  factory PromotionSettingEnvelope.fromJson(Map<String, Object?> json) =>
      _$PromotionSettingEnvelopeFromJson(json);

  final PromotionSettingDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PromotionSettingEnvelopeToJson(this);
}
