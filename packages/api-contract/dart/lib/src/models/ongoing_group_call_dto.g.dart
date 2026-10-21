// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ongoing_group_call_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OngoingGroupCallDto _$OngoingGroupCallDtoFromJson(Map<String, dynamic> json) =>
    OngoingGroupCallDto(
      id: json['id'] as String,
      groupId: json['groupId'] as String,
      groupTitle: json['groupTitle'] as String,
      video: json['video'] as bool,
      joined: (json['joined'] as num).toInt(),
      mine: json['mine'] as bool,
      startedAt: DateTime.parse(json['startedAt'] as String),
      groupAvatarUrl: json['groupAvatarUrl'] as String?,
    );

Map<String, dynamic> _$OngoingGroupCallDtoToJson(
  OngoingGroupCallDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'groupId': instance.groupId,
  'groupTitle': instance.groupTitle,
  'groupAvatarUrl': ?instance.groupAvatarUrl,
  'video': instance.video,
  'joined': instance.joined,
  'mine': instance.mine,
  'startedAt': instance.startedAt.toIso8601String(),
};
