// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mls_device_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MlsDeviceDto _$MlsDeviceDtoFromJson(Map<String, dynamic> json) => MlsDeviceDto(
  id: json['id'] as String,
  userId: json['userId'] as String,
  signatureKey: json['signatureKey'] as String,
  platform: MlsDevicePlatform.fromJson(json['platform'] as String),
  identity: json['identity'] as String,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$MlsDeviceDtoToJson(MlsDeviceDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'userId': instance.userId,
      'signatureKey': instance.signatureKey,
      'platform': instance.platform.toJson(),
      'identity': instance.identity,
      'createdAt': instance.createdAt.toIso8601String(),
    };
