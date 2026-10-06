// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_promotion_dto.dart';
import 'response_meta_dto.dart';

part 'case_promotion_envelope.g.dart';

@JsonSerializable()
class CasePromotionEnvelope {
  const CasePromotionEnvelope({required this.data, this.meta});

  factory CasePromotionEnvelope.fromJson(Map<String, Object?> json) =>
      _$CasePromotionEnvelopeFromJson(json);

  final CasePromotionDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CasePromotionEnvelopeToJson(this);
}
