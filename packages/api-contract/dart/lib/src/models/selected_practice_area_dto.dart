// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'selected_practice_area_dto.g.dart';

@JsonSerializable()
class SelectedPracticeAreaDto {
  const SelectedPracticeAreaDto({
    required this.id,
    required this.code,
    required this.i18nKey,
    required this.nameEn,
    required this.categoryId,
    required this.categoryCode,
    required this.categoryI18nKey,
  });

  factory SelectedPracticeAreaDto.fromJson(Map<String, Object?> json) =>
      _$SelectedPracticeAreaDtoFromJson(json);

  final String id;
  final String code;

  /// Translation key of the display name.
  final String i18nKey;

  /// English fallback name.
  final String nameEn;
  final String categoryId;
  final String categoryCode;
  final String categoryI18nKey;

  Map<String, Object?> toJson() => _$SelectedPracticeAreaDtoToJson(this);
}
