// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_promotion_result_dto.dart';
import 'response_meta_dto.dart';

part 'create_promotion_result_envelope.g.dart';

@JsonSerializable()
class CreatePromotionResultEnvelope {
  const CreatePromotionResultEnvelope({required this.data, this.meta});

  factory CreatePromotionResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$CreatePromotionResultEnvelopeFromJson(json);

  final CreatePromotionResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CreatePromotionResultEnvelopeToJson(this);
}
