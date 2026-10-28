// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'selfie_capture_token_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SelfieCaptureTokenDto _$SelfieCaptureTokenDtoFromJson(
  Map<String, dynamic> json,
) => SelfieCaptureTokenDto(
  token: json['token'] as String,
  expiresAt: DateTime.parse(json['expiresAt'] as String),
  requiredValue: json['required'] as bool,
);

Map<String, dynamic> _$SelfieCaptureTokenDtoToJson(
  SelfieCaptureTokenDto instance,
) => <String, dynamic>{
  'token': instance.token,
  'expiresAt': instance.expiresAt.toIso8601String(),
  'required': instance.requiredValue,
};
