// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'review_person_ref_dto.g.dart';

@JsonSerializable()
class ReviewPersonRefDto {
  const ReviewPersonRefDto({required this.adminId, required this.name});

  factory ReviewPersonRefDto.fromJson(Map<String, Object?> json) =>
      _$ReviewPersonRefDtoFromJson(json);

  final String adminId;
  final String name;

  Map<String, Object?> toJson() => _$ReviewPersonRefDtoToJson(this);
}
