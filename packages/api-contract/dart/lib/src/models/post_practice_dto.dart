// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'post_practice_dto.g.dart';

@JsonSerializable()
class PostPracticeDto {
  const PostPracticeDto({
    required this.code,
    required this.categoryCode,
    required this.nameEn,
    required this.i18nKey,
  });

  factory PostPracticeDto.fromJson(Map<String, Object?> json) =>
      _$PostPracticeDtoFromJson(json);

  final String code;
  final String categoryCode;
  final String nameEn;
  final String i18nKey;

  Map<String, Object?> toJson() => _$PostPracticeDtoToJson(this);
}
