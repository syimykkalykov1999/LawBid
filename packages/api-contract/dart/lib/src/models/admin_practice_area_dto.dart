// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_practice_area_dto.g.dart';

@JsonSerializable()
class AdminPracticeAreaDto {
  const AdminPracticeAreaDto({
    required this.id,
    required this.code,
    required this.nameEn,
    required this.sort,
    required this.isActive,
    required this.attorneys,
    required this.cases,
    required this.posts,
    this.parentCode,
  });

  factory AdminPracticeAreaDto.fromJson(Map<String, Object?> json) =>
      _$AdminPracticeAreaDtoFromJson(json);

  final String id;
  final String code;
  final String nameEn;
  final String? parentCode;
  final int sort;
  final bool isActive;
  final int attorneys;
  final int cases;
  final int posts;

  Map<String, Object?> toJson() => _$AdminPracticeAreaDtoToJson(this);
}
