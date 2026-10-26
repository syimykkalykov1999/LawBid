// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'channel_reaction_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChannelReactionDto _$ChannelReactionDtoFromJson(Map<String, dynamic> json) =>
    ChannelReactionDto(
      emoji: ChannelReactionDtoEmoji.fromJson(json['emoji'] as String),
    );

Map<String, dynamic> _$ChannelReactionDtoToJson(ChannelReactionDto instance) =>
    <String, dynamic>{'emoji': instance.emoji.toJson()};
