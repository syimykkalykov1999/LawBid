// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'appeal_client_review_dto.g.dart';

@JsonSerializable()
class AppealClientReviewDto {
  const AppealClientReviewDto({required this.reason});

  factory AppealClientReviewDto.fromJson(Map<String, Object?> json) =>
      _$AppealClientReviewDtoFromJson(json);

  final String reason;

  Map<String, Object?> toJson() => _$AppealClientReviewDtoToJson(this);
}
