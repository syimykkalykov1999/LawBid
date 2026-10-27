// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'review_sample_dto.dart';

part 'review_current_dto.g.dart';

@JsonSerializable()
class ReviewCurrentDto {
  const ReviewCurrentDto({required this.sample});

  factory ReviewCurrentDto.fromJson(Map<String, Object?> json) =>
      _$ReviewCurrentDtoFromJson(json);

  final ReviewSampleDto? sample;

  Map<String, Object?> toJson() => _$ReviewCurrentDtoToJson(this);
}
