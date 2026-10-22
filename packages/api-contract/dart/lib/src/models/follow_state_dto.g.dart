// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'follow_state_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FollowStateDto _$FollowStateDtoFromJson(Map<String, dynamic> json) =>
    FollowStateDto(
      following: json['following'] as bool,
      followersCount: (json['followersCount'] as num).toInt(),
    );

Map<String, dynamic> _$FollowStateDtoToJson(FollowStateDto instance) =>
    <String, dynamic>{
      'following': instance.following,
      'followersCount': instance.followersCount,
    };
