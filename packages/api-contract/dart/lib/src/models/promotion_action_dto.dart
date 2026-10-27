// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promotion_action_dto_kind.dart';

part 'promotion_action_dto.g.dart';

@JsonSerializable()
class PromotionActionDto {
  const PromotionActionDto({required this.kind});

  factory PromotionActionDto.fromJson(Map<String, Object?> json) =>
      _$PromotionActionDtoFromJson(json);

  final PromotionActionDtoKind kind;

  Map<String, Object?> toJson() => _$PromotionActionDtoToJson(this);
}
