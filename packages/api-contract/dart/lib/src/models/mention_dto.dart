// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'mention_kind.dart';

part 'mention_dto.g.dart';

@JsonSerializable()
class MentionDto {
  const MentionDto({
    required this.username,
    required this.userId,
    required this.kind,
  });

  factory MentionDto.fromJson(Map<String, Object?> json) =>
      _$MentionDtoFromJson(json);

  /// As written in the text, lowercase.
  final String username;
  final String userId;
  final MentionKind kind;

  Map<String, Object?> toJson() => _$MentionDtoToJson(this);
}
