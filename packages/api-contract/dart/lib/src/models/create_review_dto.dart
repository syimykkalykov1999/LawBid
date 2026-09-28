// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_review_dto.g.dart';

@JsonSerializable()
class CreateReviewDto {
  const CreateReviewDto({required this.rating, this.body});

  factory CreateReviewDto.fromJson(Map<String, Object?> json) =>
      _$CreateReviewDtoFromJson(json);

  final int rating;
  final String? body;

  Map<String, Object?> toJson() => _$CreateReviewDtoToJson(this);
}
