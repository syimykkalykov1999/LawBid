// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_reaction_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupReactionDto _$GroupReactionDtoFromJson(Map<String, dynamic> json) =>
    GroupReactionDto(
      emoji: GroupReactionDtoEmoji.fromJson(json['emoji'] as String),
    );

Map<String, dynamic> _$GroupReactionDtoToJson(GroupReactionDto instance) =>
    <String, dynamic>{'emoji': instance.emoji.toJson()};
