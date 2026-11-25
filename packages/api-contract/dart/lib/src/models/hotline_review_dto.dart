// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_review_dto.g.dart';

@JsonSerializable()
class HotlineReviewDto {
  const HotlineReviewDto({required this.stars, this.comment});

  factory HotlineReviewDto.fromJson(Map<String, Object?> json) =>
      _$HotlineReviewDtoFromJson(json);

  final num stars;
  final String? comment;

  Map<String, Object?> toJson() => _$HotlineReviewDtoToJson(this);
}
