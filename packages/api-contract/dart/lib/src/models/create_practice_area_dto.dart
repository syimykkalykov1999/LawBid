// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_practice_area_dto.g.dart';

@JsonSerializable()
class CreatePracticeAreaDto {
  const CreatePracticeAreaDto({required this.code, required this.nameEn});

  factory CreatePracticeAreaDto.fromJson(Map<String, Object?> json) =>
      _$CreatePracticeAreaDtoFromJson(json);

  final String code;
  final String nameEn;

  Map<String, Object?> toJson() => _$CreatePracticeAreaDtoToJson(this);
}
