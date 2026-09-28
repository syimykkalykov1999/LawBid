// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'practice_area_leaf_dto.g.dart';

@JsonSerializable()
class PracticeAreaLeafDto {
  const PracticeAreaLeafDto({
    required this.id,
    required this.code,
    required this.i18nKey,
    required this.nameEn,
  });

  factory PracticeAreaLeafDto.fromJson(Map<String, Object?> json) =>
      _$PracticeAreaLeafDtoFromJson(json);

  final String id;
  final String code;

  /// Translation key of the display name.
  final String i18nKey;

  /// English fallback name.
  final String nameEn;

  Map<String, Object?> toJson() => _$PracticeAreaLeafDtoToJson(this);
}
