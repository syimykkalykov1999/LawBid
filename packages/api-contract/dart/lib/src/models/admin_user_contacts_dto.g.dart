// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_user_contacts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminUserContactsDto _$AdminUserContactsDtoFromJson(
  Map<String, dynamic> json,
) => AdminUserContactsDto(
  email: json['email'] as String?,
  emailVerifiedAt: json['emailVerifiedAt'] == null
      ? null
      : DateTime.parse(json['emailVerifiedAt'] as String),
  phone: json['phone'] as String?,
  phoneVerifiedAt: json['phoneVerifiedAt'] == null
      ? null
      : DateTime.parse(json['phoneVerifiedAt'] as String),
  preferredContactNote: json['preferredContactNote'] as String?,
);

Map<String, dynamic> _$AdminUserContactsDtoToJson(
  AdminUserContactsDto instance,
) => <String, dynamic>{
  'email': ?instance.email,
  'emailVerifiedAt': ?instance.emailVerifiedAt?.toIso8601String(),
  'phone': ?instance.phone,
  'phoneVerifiedAt': ?instance.phoneVerifiedAt?.toIso8601String(),
  'preferredContactNote': ?instance.preferredContactNote,
};
