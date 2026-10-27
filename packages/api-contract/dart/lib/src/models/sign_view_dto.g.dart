// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sign_view_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SignViewDto _$SignViewDtoFromJson(Map<String, dynamic> json) => SignViewDto(
  role: SignViewDtoRole.fromJson(json['role'] as String),
  at: DateTime.parse(json['at'] as String),
);

Map<String, dynamic> _$SignViewDtoToJson(SignViewDto instance) =>
    <String, dynamic>{
      'role': instance.role.toJson(),
      'at': instance.at.toIso8601String(),
    };
