// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'channel_reaction_count_dto_emoji.dart';

part 'channel_reaction_count_dto.g.dart';

@JsonSerializable()
class ChannelReactionCountDto {
  const ChannelReactionCountDto({required this.emoji, required this.count});

  factory ChannelReactionCountDto.fromJson(Map<String, Object?> json) =>
      _$ChannelReactionCountDtoFromJson(json);

  final ChannelReactionCountDtoEmoji emoji;
  final int count;

  Map<String, Object?> toJson() => _$ChannelReactionCountDtoToJson(this);
}
