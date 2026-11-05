// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_reaction_count_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupReactionCountDto _$GroupReactionCountDtoFromJson(
  Map<String, dynamic> json,
) => GroupReactionCountDto(
  emoji: json['emoji'] as String,
  count: (json['count'] as num).toInt(),
);

Map<String, dynamic> _$GroupReactionCountDtoToJson(
  GroupReactionCountDto instance,
) => <String, dynamic>{'emoji': instance.emoji, 'count': instance.count};
