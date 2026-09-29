// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'category_setting_dto_category.dart';

part 'category_setting_dto.g.dart';

@JsonSerializable()
class CategorySettingDto {
  const CategorySettingDto({
    required this.category,
    required this.pushEnabled,
    required this.emailEnabled,
  });

  factory CategorySettingDto.fromJson(Map<String, Object?> json) =>
      _$CategorySettingDtoFromJson(json);

  final CategorySettingDtoCategory category;
  final bool pushEnabled;
  final bool emailEnabled;

  Map<String, Object?> toJson() => _$CategorySettingDtoToJson(this);
}
