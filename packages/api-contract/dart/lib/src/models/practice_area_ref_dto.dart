// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'practice_area_ref_dto.g.dart';

@JsonSerializable()
class PracticeAreaRefDto {
  const PracticeAreaRefDto({
    required this.id,
    required this.code,
    required this.nameEn,
    required this.i18nKey,
  });

  factory PracticeAreaRefDto.fromJson(Map<String, Object?> json) =>
      _$PracticeAreaRefDtoFromJson(json);

  final String id;
  final String code;
  final String nameEn;
  final String i18nKey;

  Map<String, Object?> toJson() => _$PracticeAreaRefDtoToJson(this);
}
