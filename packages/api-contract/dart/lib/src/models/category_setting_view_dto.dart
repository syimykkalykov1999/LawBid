// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'category_setting_view_dto_category.dart';

part 'category_setting_view_dto.g.dart';

@JsonSerializable()
class CategorySettingViewDto {
  const CategorySettingViewDto({
    required this.category,
    required this.pushEnabled,
    required this.emailEnabled,
    required this.locked,
  });

  factory CategorySettingViewDto.fromJson(Map<String, Object?> json) =>
      _$CategorySettingViewDtoFromJson(json);

  final CategorySettingViewDtoCategory category;
  final bool pushEnabled;
  final bool emailEnabled;

  /// `system` can not be turned off (§9.5).
  final bool locked;

  Map<String, Object?> toJson() => _$CategorySettingViewDtoToJson(this);
}
