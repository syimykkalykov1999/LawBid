// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reaction_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReactionDto _$ReactionDtoFromJson(Map<String, dynamic> json) => ReactionDto(
  emoji: json['emoji'] as String,
  count: (json['count'] as num).toInt(),
  mine: json['mine'] as bool,
);

Map<String, dynamic> _$ReactionDtoToJson(ReactionDto instance) =>
    <String, dynamic>{
      'emoji': instance.emoji,
      'count': instance.count,
      'mine': instance.mine,
    };
