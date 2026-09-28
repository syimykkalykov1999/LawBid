// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'practice_area_leaf_dto.dart';

part 'practice_area_category_dto.g.dart';

@JsonSerializable()
class PracticeAreaCategoryDto {
  const PracticeAreaCategoryDto({
    required this.id,
    required this.code,
    required this.i18nKey,
    required this.nameEn,
    required this.children,
  });

  factory PracticeAreaCategoryDto.fromJson(Map<String, Object?> json) =>
      _$PracticeAreaCategoryDtoFromJson(json);

  final String id;
  final String code;
  final String i18nKey;
  final String nameEn;
  final List<PracticeAreaLeafDto> children;

  Map<String, Object?> toJson() => _$PracticeAreaCategoryDtoToJson(this);
}
