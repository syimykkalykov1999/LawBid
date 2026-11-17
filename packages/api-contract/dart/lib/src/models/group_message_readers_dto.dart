// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_person_dto.dart';

part 'group_message_readers_dto.g.dart';

@JsonSerializable()
class GroupMessageReadersDto {
  const GroupMessageReadersDto({
    required this.readers,
    required this.recipients,
  });

  factory GroupMessageReadersDto.fromJson(Map<String, Object?> json) =>
      _$GroupMessageReadersDtoFromJson(json);

  /// Members whose read mark is at or past the message.
  final List<GroupPersonDto> readers;

  /// Current members besides the author (who could read it).
  final int recipients;

  Map<String, Object?> toJson() => _$GroupMessageReadersDtoToJson(this);
}
