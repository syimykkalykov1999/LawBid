// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_demo_account_created_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDemoAccountCreatedDto _$AdminDemoAccountCreatedDtoFromJson(
  Map<String, dynamic> json,
) => AdminDemoAccountCreatedDto(
  account: AdminDemoAccountDto.fromJson(
    json['account'] as Map<String, dynamic>,
  ),
  inviteCode: json['inviteCode'] as String?,
);

Map<String, dynamic> _$AdminDemoAccountCreatedDtoToJson(
  AdminDemoAccountCreatedDto instance,
) => <String, dynamic>{
  'account': instance.account.toJson(),
  'inviteCode': ?instance.inviteCode,
};
