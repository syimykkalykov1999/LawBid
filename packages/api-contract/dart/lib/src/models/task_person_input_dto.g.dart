// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_person_input_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TaskPersonInputDto _$TaskPersonInputDtoFromJson(Map<String, dynamic> json) =>
    TaskPersonInputDto(
      userId: json['userId'] as String?,
      name: json['name'] as String?,
      role: json['role'] as String?,
      phone: json['phone'] as String?,
      email: json['email'] as String?,
    );

Map<String, dynamic> _$TaskPersonInputDtoToJson(TaskPersonInputDto instance) =>
    <String, dynamic>{
      'userId': ?instance.userId,
      'name': ?instance.name,
      'role': ?instance.role,
      'phone': ?instance.phone,
      'email': ?instance.email,
    };
