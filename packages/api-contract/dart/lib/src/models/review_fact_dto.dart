// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'review_fact_dto.g.dart';

@JsonSerializable()
class ReviewFactDto {
  const ReviewFactDto({required this.key, required this.value});

  factory ReviewFactDto.fromJson(Map<String, Object?> json) =>
      _$ReviewFactDtoFromJson(json);

  final String key;
  final String value;

  Map<String, Object?> toJson() => _$ReviewFactDtoToJson(this);
}
