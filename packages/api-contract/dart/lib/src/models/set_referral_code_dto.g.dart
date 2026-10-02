// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'set_referral_code_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SetReferralCodeDto _$SetReferralCodeDtoFromJson(Map<String, dynamic> json) =>
    SetReferralCodeDto(
      userId: json['userId'] as String,
      code: json['code'] as String,
      reason: json['reason'] as String,
    );

Map<String, dynamic> _$SetReferralCodeDtoToJson(SetReferralCodeDto instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'code': instance.code,
      'reason': instance.reason,
    };
