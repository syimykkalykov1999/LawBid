// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'start_direct_chat_dto.g.dart';

@JsonSerializable()
class StartDirectChatDto {
  const StartDirectChatDto({required this.userId});

  factory StartDirectChatDto.fromJson(Map<String, Object?> json) =>
      _$StartDirectChatDtoFromJson(json);

  final String userId;

  Map<String, Object?> toJson() => _$StartDirectChatDtoToJson(this);
}
