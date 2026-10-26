// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_person_suggestion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TaskPersonSuggestionDto _$TaskPersonSuggestionDtoFromJson(
  Map<String, dynamic> json,
) => TaskPersonSuggestionDto(
  source: TaskPersonSuggestionDtoSource.fromJson(json['source'] as String),
  name: json['name'] as String,
  userId: json['userId'] as String?,
  membershipId: json['membershipId'] as String?,
  avatarUrl: json['avatarUrl'] as String?,
  role: json['role'] as String?,
  phone: json['phone'] as String?,
  email: json['email'] as String?,
);

Map<String, dynamic> _$TaskPersonSuggestionDtoToJson(
  TaskPersonSuggestionDto instance,
) => <String, dynamic>{
  'userId': ?instance.userId,
  'membershipId': ?instance.membershipId,
  'source': instance.source.toJson(),
  'name': instance.name,
  'avatarUrl': ?instance.avatarUrl,
  'role': ?instance.role,
  'phone': ?instance.phone,
  'email': ?instance.email,
};
