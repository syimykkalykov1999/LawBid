// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'channel_reaction_dto_emoji.dart';

part 'channel_reaction_dto.g.dart';

@JsonSerializable()
class ChannelReactionDto {
  const ChannelReactionDto({required this.emoji});

  factory ChannelReactionDto.fromJson(Map<String, Object?> json) =>
      _$ChannelReactionDtoFromJson(json);

  final ChannelReactionDtoEmoji emoji;

  Map<String, Object?> toJson() => _$ChannelReactionDtoToJson(this);
}
