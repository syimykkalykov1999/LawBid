// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_mls_device_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupMlsDeviceDto _$GroupMlsDeviceDtoFromJson(Map<String, dynamic> json) =>
    GroupMlsDeviceDto(
      deviceId: json['deviceId'] as String,
      userId: json['userId'] as String,
      signatureKey: json['signatureKey'] as String,
      inGroup: json['inGroup'] as bool,
      lastCommitAt: json['lastCommitAt'] == null
          ? null
          : DateTime.parse(json['lastCommitAt'] as String),
    );

Map<String, dynamic> _$GroupMlsDeviceDtoToJson(GroupMlsDeviceDto instance) =>
    <String, dynamic>{
      'deviceId': instance.deviceId,
      'userId': instance.userId,
      'signatureKey': instance.signatureKey,
      'inGroup': instance.inGroup,
      'lastCommitAt': ?instance.lastCommitAt?.toIso8601String(),
    };
