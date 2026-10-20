// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_channel_comment_dto.g.dart';

@JsonSerializable()
class CreateChannelCommentDto {
  const CreateChannelCommentDto({required this.body});

  factory CreateChannelCommentDto.fromJson(Map<String, Object?> json) =>
      _$CreateChannelCommentDtoFromJson(json);

  final String body;

  Map<String, Object?> toJson() => _$CreateChannelCommentDtoToJson(this);
}
