// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promo_validation_dto.dart';
import 'response_meta_dto.dart';

part 'promo_validation_envelope.g.dart';

@JsonSerializable()
class PromoValidationEnvelope {
  const PromoValidationEnvelope({required this.data, this.meta});

  factory PromoValidationEnvelope.fromJson(Map<String, Object?> json) =>
      _$PromoValidationEnvelopeFromJson(json);

  final PromoValidationDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PromoValidationEnvelopeToJson(this);
}
