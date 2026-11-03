// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'quick_reply_dto.g.dart';

@JsonSerializable()
class QuickReplyDto {
  const QuickReplyDto({
    required this.id,
    required this.title,
    required this.body,
  });

  factory QuickReplyDto.fromJson(Map<String, Object?> json) =>
      _$QuickReplyDtoFromJson(json);

  final String id;
  final String title;
  final String body;

  Map<String, Object?> toJson() => _$QuickReplyDtoToJson(this);
}
