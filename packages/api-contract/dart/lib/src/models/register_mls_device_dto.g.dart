// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'register_mls_device_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RegisterMlsDeviceDto _$RegisterMlsDeviceDtoFromJson(
  Map<String, dynamic> json,
) => RegisterMlsDeviceDto(
  signatureKey: json['signatureKey'] as String,
  platform: MlsDevicePlatform.fromJson(json['platform'] as String),
);

Map<String, dynamic> _$RegisterMlsDeviceDtoToJson(
  RegisterMlsDeviceDto instance,
) => <String, dynamic>{
  'signatureKey': instance.signatureKey,
  'platform': instance.platform.toJson(),
};
