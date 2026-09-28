// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_review_dto.g.dart';

@JsonSerializable()
class UpdateReviewDto {
  const UpdateReviewDto({this.rating, this.body});

  factory UpdateReviewDto.fromJson(Map<String, Object?> json) =>
      _$UpdateReviewDtoFromJson(json);

  final int? rating;
  final String? body;

  Map<String, Object?> toJson() => _$UpdateReviewDtoToJson(this);
}
