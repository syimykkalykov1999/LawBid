// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'qa_person_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QaPersonDto _$QaPersonDtoFromJson(Map<String, dynamic> json) => QaPersonDto(
  id: json['id'] as String,
  displayName: json['displayName'] as String,
  username: json['username'] as String?,
  avatarUrl: json['avatarUrl'] as String?,
);

Map<String, dynamic> _$QaPersonDtoToJson(QaPersonDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'displayName': instance.displayName,
      'username': ?instance.username,
      'avatarUrl': ?instance.avatarUrl,
    };
