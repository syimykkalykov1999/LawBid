// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'consultation_person_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConsultationPersonDto _$ConsultationPersonDtoFromJson(
  Map<String, dynamic> json,
) => ConsultationPersonDto(
  id: json['id'] as String,
  displayName: json['displayName'] as String,
  username: json['username'] as String?,
  avatarUrl: json['avatarUrl'] as String?,
);

Map<String, dynamic> _$ConsultationPersonDtoToJson(
  ConsultationPersonDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'displayName': instance.displayName,
  'username': ?instance.username,
  'avatarUrl': ?instance.avatarUrl,
};
