// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'saved_item_type.dart';

part 'saved_item_dto.g.dart';

@JsonSerializable()
class SavedItemDto {
  const SavedItemDto({required this.itemType, required this.itemId});

  factory SavedItemDto.fromJson(Map<String, Object?> json) =>
      _$SavedItemDtoFromJson(json);

  final SavedItemType itemType;
  final String itemId;

  Map<String, Object?> toJson() => _$SavedItemDtoToJson(this);
}
