// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'rating_dto.g.dart';

@JsonSerializable()
class RatingDto {
  const RatingDto({required this.avg, required this.count});

  factory RatingDto.fromJson(Map<String, Object?> json) =>
      _$RatingDtoFromJson(json);

  /// Average of published reviews, 0 if none.
  final num avg;
  final num count;

  Map<String, Object?> toJson() => _$RatingDtoToJson(this);
}
