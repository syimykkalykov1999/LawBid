// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_create_demo_account_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCreateDemoAccountDto _$AdminCreateDemoAccountDtoFromJson(
  Map<String, dynamic> json,
) => AdminCreateDemoAccountDto(
  role: DemoRole.fromJson(json['role'] as String),
  withInvite: json['withInvite'] as bool? ?? true,
  firstName: json['firstName'] as String?,
  lastName: json['lastName'] as String?,
  label: json['label'] as String?,
);

Map<String, dynamic> _$AdminCreateDemoAccountDtoToJson(
  AdminCreateDemoAccountDto instance,
) => <String, dynamic>{
  'role': instance.role.toJson(),
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
  'label': ?instance.label,
  'withInvite': instance.withInvite,
};
