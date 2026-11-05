// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_reaction_dto_emoji.dart';

part 'group_reaction_dto.g.dart';

@JsonSerializable()
class GroupReactionDto {
  const GroupReactionDto({required this.emoji});

  factory GroupReactionDto.fromJson(Map<String, Object?> json) =>
      _$GroupReactionDtoFromJson(json);

  /// One of the app palette (and the group setting).
  final GroupReactionDtoEmoji emoji;

  Map<String, Object?> toJson() => _$GroupReactionDtoToJson(this);
}
