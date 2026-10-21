// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ongoing_call_person_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OngoingCallPersonDto _$OngoingCallPersonDtoFromJson(
  Map<String, dynamic> json,
) => OngoingCallPersonDto(
  userId: json['userId'] as String,
  displayName: json['displayName'] as String?,
  avatarUrl: json['avatarUrl'] as String?,
);

Map<String, dynamic> _$OngoingCallPersonDtoToJson(
  OngoingCallPersonDto instance,
) => <String, dynamic>{
  'userId': instance.userId,
  'displayName': ?instance.displayName,
  'avatarUrl': ?instance.avatarUrl,
};
