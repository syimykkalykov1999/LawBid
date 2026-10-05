// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'my_promotion_dto.dart';
import 'response_meta_dto.dart';

part 'my_promotion_list_envelope.g.dart';

@JsonSerializable()
class MyPromotionListEnvelope {
  const MyPromotionListEnvelope({required this.data, this.meta});

  factory MyPromotionListEnvelope.fromJson(Map<String, Object?> json) =>
      _$MyPromotionListEnvelopeFromJson(json);

  final List<MyPromotionDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MyPromotionListEnvelopeToJson(this);
}
