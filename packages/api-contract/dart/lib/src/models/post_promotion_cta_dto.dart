// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_promotion_cta_dto_type.dart';

part 'post_promotion_cta_dto.g.dart';

@JsonSerializable()
class PostPromotionCtaDto {
  const PostPromotionCtaDto({required this.type, this.value});

  factory PostPromotionCtaDto.fromJson(Map<String, Object?> json) =>
      _$PostPromotionCtaDtoFromJson(json);

  final PostPromotionCtaDtoType type;
  final String? value;

  Map<String, Object?> toJson() => _$PostPromotionCtaDtoToJson(this);
}
