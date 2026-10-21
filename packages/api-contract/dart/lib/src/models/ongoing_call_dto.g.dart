// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ongoing_call_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OngoingCallDto _$OngoingCallDtoFromJson(Map<String, dynamic> json) =>
    OngoingCallDto(
      id: json['id'] as String,
      video: json['video'] as bool,
      participantCount: json['participantCount'] as num,
      participants: (json['participants'] as List<dynamic>)
          .map((e) => OngoingCallPersonDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      startedAt: DateTime.parse(json['startedAt'] as String),
    );

Map<String, dynamic> _$OngoingCallDtoToJson(OngoingCallDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'video': instance.video,
      'participantCount': instance.participantCount,
      'participants': instance.participants.map((e) => e.toJson()).toList(),
      'startedAt': instance.startedAt.toIso8601String(),
    };
