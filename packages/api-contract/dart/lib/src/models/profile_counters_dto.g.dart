// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'profile_counters_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ProfileCountersDto _$ProfileCountersDtoFromJson(Map<String, dynamic> json) =>
    ProfileCountersDto(
      posts: json['posts'] as num,
      followers: json['followers'] as num,
      following: json['following'] as num,
    );

Map<String, dynamic> _$ProfileCountersDtoToJson(ProfileCountersDto instance) =>
    <String, dynamic>{
      'posts': instance.posts,
      'followers': instance.followers,
      'following': instance.following,
    };
