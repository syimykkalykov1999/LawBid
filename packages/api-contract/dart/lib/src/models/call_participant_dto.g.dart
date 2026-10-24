// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'call_participant_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CallParticipantDto _$CallParticipantDtoFromJson(Map<String, dynamic> json) =>
    CallParticipantDto(
      userId: json['userId'] as String,
      status: CallParticipantStatus.fromJson(json['status'] as String),
      muted: json['muted'] as bool,
      mutedByHost: json['mutedByHost'] as bool,
      displayName: json['displayName'] as String?,
      username: json['username'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      joinedAt: json['joinedAt'] == null
          ? null
          : DateTime.parse(json['joinedAt'] as String),
      sfuReady: json['sfuReady'] as bool?,
      sfuTracks: (json['sfuTracks'] as List<dynamic>?)
          ?.map((e) => CallParticipantDtoSfuTracks.fromJson(e as String))
          .toList(),
    );

Map<String, dynamic> _$CallParticipantDtoToJson(CallParticipantDto instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'displayName': ?instance.displayName,
      'username': ?instance.username,
      'avatarUrl': ?instance.avatarUrl,
      'status': instance.status.toJson(),
      'muted': instance.muted,
      'mutedByHost': instance.mutedByHost,
      'joinedAt': ?instance.joinedAt?.toIso8601String(),
      'sfuReady': ?instance.sfuReady,
      'sfuTracks': ?instance.sfuTracks?.map((e) => e.toJson()).toList(),
    };
