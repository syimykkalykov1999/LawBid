// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'group_reaction_count_dto.g.dart';

@JsonSerializable()
class GroupReactionCountDto {
  const GroupReactionCountDto({required this.emoji, required this.count});

  factory GroupReactionCountDto.fromJson(Map<String, Object?> json) =>
      _$GroupReactionCountDtoFromJson(json);

  final String emoji;
  final int count;

  Map<String, Object?> toJson() => _$GroupReactionCountDtoToJson(this);
}
