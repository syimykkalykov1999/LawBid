// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'review_reply_dto.g.dart';

@JsonSerializable()
class ReviewReplyDto {
  const ReviewReplyDto({required this.body});

  factory ReviewReplyDto.fromJson(Map<String, Object?> json) =>
      _$ReviewReplyDtoFromJson(json);

  final String body;

  Map<String, Object?> toJson() => _$ReviewReplyDtoToJson(this);
}
