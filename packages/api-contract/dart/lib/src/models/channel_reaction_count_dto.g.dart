// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'channel_reaction_count_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChannelReactionCountDto _$ChannelReactionCountDtoFromJson(
  Map<String, dynamic> json,
) => ChannelReactionCountDto(
  emoji: ChannelReactionCountDtoEmoji.fromJson(json['emoji'] as String),
  count: (json['count'] as num).toInt(),
);

Map<String, dynamic> _$ChannelReactionCountDtoToJson(
  ChannelReactionCountDto instance,
) => <String, dynamic>{
  'emoji': instance.emoji.toJson(),
  'count': instance.count,
};
