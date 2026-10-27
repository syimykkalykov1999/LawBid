// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'promotion_checklist_item_dto.g.dart';

@JsonSerializable()
class PromotionChecklistItemDto {
  const PromotionChecklistItemDto({
    required this.id,
    required this.key,
    required this.done,
  });

  factory PromotionChecklistItemDto.fromJson(Map<String, Object?> json) =>
      _$PromotionChecklistItemDtoFromJson(json);

  final String id;

  /// app_config key `seo.checklist.<id>`.
  final String key;
  final bool done;

  Map<String, Object?> toJson() => _$PromotionChecklistItemDtoToJson(this);
}
