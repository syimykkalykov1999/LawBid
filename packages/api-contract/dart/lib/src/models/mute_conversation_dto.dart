// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'mute_conversation_dto.g.dart';

@JsonSerializable()
class MuteConversationDto {
  const MuteConversationDto({this.until});

  factory MuteConversationDto.fromJson(Map<String, Object?> json) =>
      _$MuteConversationDtoFromJson(json);

  /// ISO time; null unmutes.
  final String? until;

  Map<String, Object?> toJson() => _$MuteConversationDtoToJson(this);
}
