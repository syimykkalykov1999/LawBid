// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_reply_preview_dto_type.dart';

part 'group_reply_preview_dto.g.dart';

@JsonSerializable()
class GroupReplyPreviewDto {
  const GroupReplyPreviewDto({
    required this.id,
    required this.type,
    required this.snippet,
    required this.deleted,
    this.senderName,
  });

  factory GroupReplyPreviewDto.fromJson(Map<String, Object?> json) =>
      _$GroupReplyPreviewDtoFromJson(json);

  final String id;
  final String? senderName;
  final GroupReplyPreviewDtoType type;

  /// A short quote of the text / caption / question.
  final String snippet;
  final bool deleted;

  Map<String, Object?> toJson() => _$GroupReplyPreviewDtoToJson(this);
}
