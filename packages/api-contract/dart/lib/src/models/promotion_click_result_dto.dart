// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'promotion_click_result_dto.g.dart';

@JsonSerializable()
class PromotionClickResultDto {
  const PromotionClickResultDto({required this.ok});

  factory PromotionClickResultDto.fromJson(Map<String, Object?> json) =>
      _$PromotionClickResultDtoFromJson(json);

  final bool ok;

  Map<String, Object?> toJson() => _$PromotionClickResultDtoToJson(this);
}
