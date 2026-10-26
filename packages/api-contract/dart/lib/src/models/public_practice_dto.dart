// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'public_practice_dto.g.dart';

@JsonSerializable()
class PublicPracticeDto {
  const PublicPracticeDto({required this.code, required this.name});

  factory PublicPracticeDto.fromJson(Map<String, Object?> json) =>
      _$PublicPracticeDtoFromJson(json);

  final String code;
  final String name;

  Map<String, Object?> toJson() => _$PublicPracticeDtoToJson(this);
}
