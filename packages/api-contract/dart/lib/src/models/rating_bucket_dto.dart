// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'rating_bucket_dto.g.dart';

@JsonSerializable()
class RatingBucketDto {
  const RatingBucketDto({required this.stars, required this.count});

  factory RatingBucketDto.fromJson(Map<String, Object?> json) =>
      _$RatingBucketDtoFromJson(json);

  final int stars;
  final int count;

  Map<String, Object?> toJson() => _$RatingBucketDtoToJson(this);
}
