// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reply_preview_dto_type.dart';

part 'reply_preview_dto.g.dart';

@JsonSerializable()
class ReplyPreviewDto {
  const ReplyPreviewDto({
    required this.id,
    required this.type,
    required this.snippet,
    required this.revoked,
    this.senderId,
  });

  factory ReplyPreviewDto.fromJson(Map<String, Object?> json) =>
      _$ReplyPreviewDtoFromJson(json);

  final String id;
  final String? senderId;
  final ReplyPreviewDtoType type;

  /// First 120 characters; empty for media.
  final String snippet;

  /// The quoted message was deleted for everyone.
  final bool revoked;

  Map<String, Object?> toJson() => _$ReplyPreviewDtoToJson(this);
}
