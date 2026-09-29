// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'case_practice_area_dto.g.dart';

@JsonSerializable()
class CasePracticeAreaDto {
  const CasePracticeAreaDto({
    required this.id,
    required this.code,
    required this.i18nKey,
    required this.nameEn,
    required this.categoryId,
    required this.categoryCode,
    required this.categoryI18nKey,
    required this.categoryNameEn,
  });

  factory CasePracticeAreaDto.fromJson(Map<String, Object?> json) =>
      _$CasePracticeAreaDtoFromJson(json);

  final String id;
  final String code;
  final String i18nKey;
  final String nameEn;
  final String categoryId;
  final String categoryCode;
  final String categoryI18nKey;
  final String categoryNameEn;

  Map<String, Object?> toJson() => _$CasePracticeAreaDtoToJson(this);
}
