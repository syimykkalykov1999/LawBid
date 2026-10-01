// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_practice_area_dto.g.dart';

@JsonSerializable()
class UpdatePracticeAreaDto {
  const UpdatePracticeAreaDto({this.nameEn, this.isActive, this.sort});

  factory UpdatePracticeAreaDto.fromJson(Map<String, Object?> json) =>
      _$UpdatePracticeAreaDtoFromJson(json);

  final String? nameEn;
  final bool? isActive;
  final int? sort;

  Map<String, Object?> toJson() => _$UpdatePracticeAreaDtoToJson(this);
}
