// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'review_helpful_dto.g.dart';

@JsonSerializable()
class ReviewHelpfulDto {
  const ReviewHelpfulDto({required this.helpful});

  factory ReviewHelpfulDto.fromJson(Map<String, Object?> json) =>
      _$ReviewHelpfulDtoFromJson(json);

  final bool helpful;

  Map<String, Object?> toJson() => _$ReviewHelpfulDtoToJson(this);
}
