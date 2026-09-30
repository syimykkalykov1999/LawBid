// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'upsert_client_review_dto.g.dart';

@JsonSerializable()
class UpsertClientReviewDto {
  const UpsertClientReviewDto({required this.rating, this.body});

  factory UpsertClientReviewDto.fromJson(Map<String, Object?> json) =>
      _$UpsertClientReviewDtoFromJson(json);

  final num rating;
  final String? body;

  Map<String, Object?> toJson() => _$UpsertClientReviewDtoToJson(this);
}
