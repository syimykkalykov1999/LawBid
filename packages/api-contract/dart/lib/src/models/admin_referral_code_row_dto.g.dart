// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_referral_code_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminReferralCodeRowDto _$AdminReferralCodeRowDtoFromJson(
  Map<String, dynamic> json,
) => AdminReferralCodeRowDto(
  userId: json['userId'] as String,
  code: json['code'] as String,
  ownerName: json['ownerName'] as String?,
  ownerEmail: json['ownerEmail'] as String?,
  invited: (json['invited'] as num).toInt(),
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$AdminReferralCodeRowDtoToJson(
  AdminReferralCodeRowDto instance,
) => <String, dynamic>{
  'userId': instance.userId,
  'code': instance.code,
  'ownerName': ?instance.ownerName,
  'ownerEmail': ?instance.ownerEmail,
  'invited': instance.invited,
  'createdAt': instance.createdAt.toIso8601String(),
};
