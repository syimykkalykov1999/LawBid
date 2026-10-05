// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fraud_user_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FraudUserDto _$FraudUserDtoFromJson(Map<String, dynamic> json) => FraudUserDto(
  id: json['id'] as String,
  name: json['name'] as String?,
  role: json['role'] == null
      ? null
      : FraudUserDtoRole.fromJson(json['role'] as String),
  accountStatus: json['accountStatus'] as String,
  email: json['email'] as String?,
  phone: json['phone'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$FraudUserDtoToJson(FraudUserDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': ?instance.name,
      'role': ?instance.role?.toJson(),
      'accountStatus': instance.accountStatus,
      'email': ?instance.email,
      'phone': ?instance.phone,
      'createdAt': instance.createdAt.toIso8601String(),
    };
