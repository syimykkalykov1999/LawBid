// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_person_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TaskPersonDto _$TaskPersonDtoFromJson(Map<String, dynamic> json) =>
    TaskPersonDto(
      id: json['id'] as String,
      name: json['name'] as String,
      userId: json['userId'] as String?,
      userRole: json['userRole'] == null
          ? null
          : TaskPersonDtoUserRole.fromJson(json['userRole'] as String),
      avatarUrl: json['avatarUrl'] as String?,
      role: json['role'] as String?,
      phone: json['phone'] as String?,
      email: json['email'] as String?,
    );

Map<String, dynamic> _$TaskPersonDtoToJson(TaskPersonDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'userId': ?instance.userId,
      'userRole': ?instance.userRole?.toJson(),
      'avatarUrl': ?instance.avatarUrl,
      'name': instance.name,
      'role': ?instance.role,
      'phone': ?instance.phone,
      'email': ?instance.email,
    };
