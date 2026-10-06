// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_demo_account_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateDemoAccountDto _$CreateDemoAccountDtoFromJson(
  Map<String, dynamic> json,
) => CreateDemoAccountDto(
  role: DemoRole.fromJson(json['role'] as String),
  firstName: json['firstName'] as String?,
  lastName: json['lastName'] as String?,
);

Map<String, dynamic> _$CreateDemoAccountDtoToJson(
  CreateDemoAccountDto instance,
) => <String, dynamic>{
  'role': instance.role.toJson(),
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
};
