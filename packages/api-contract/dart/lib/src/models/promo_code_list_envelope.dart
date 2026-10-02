// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promo_code_dto.dart';
import 'response_meta_dto.dart';

part 'promo_code_list_envelope.g.dart';

@JsonSerializable()
class PromoCodeListEnvelope {
  const PromoCodeListEnvelope({required this.data, this.meta});

  factory PromoCodeListEnvelope.fromJson(Map<String, Object?> json) =>
      _$PromoCodeListEnvelopeFromJson(json);

  final List<PromoCodeDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PromoCodeListEnvelopeToJson(this);
}
