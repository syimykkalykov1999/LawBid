// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promo_code_dto.dart';
import 'response_meta_dto.dart';

part 'promo_code_envelope.g.dart';

@JsonSerializable()
class PromoCodeEnvelope {
  const PromoCodeEnvelope({required this.data, this.meta});

  factory PromoCodeEnvelope.fromJson(Map<String, Object?> json) =>
      _$PromoCodeEnvelopeFromJson(json);

  final PromoCodeDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PromoCodeEnvelopeToJson(this);
}
