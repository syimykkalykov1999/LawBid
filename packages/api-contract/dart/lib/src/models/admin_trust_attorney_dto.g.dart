// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_trust_attorney_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTrustAttorneyDto _$AdminTrustAttorneyDtoFromJson(
  Map<String, dynamic> json,
) => AdminTrustAttorneyDto(
  id: json['id'] as String,
  firstName: json['firstName'] as String?,
  lastName: json['lastName'] as String?,
  username: json['username'] as String,
  verificationStatus: json['verificationStatus'] as String,
);

Map<String, dynamic> _$AdminTrustAttorneyDtoToJson(
  AdminTrustAttorneyDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
  'username': instance.username,
  'verificationStatus': instance.verificationStatus,
};
