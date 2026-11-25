// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mls_group_member_device_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MlsGroupMemberDeviceDto _$MlsGroupMemberDeviceDtoFromJson(
  Map<String, dynamic> json,
) => MlsGroupMemberDeviceDto(
  deviceId: json['deviceId'] as String,
  userId: json['userId'] as String,
  signatureKey: json['signatureKey'] as String,
  inGroup: json['inGroup'] as bool,
);

Map<String, dynamic> _$MlsGroupMemberDeviceDtoToJson(
  MlsGroupMemberDeviceDto instance,
) => <String, dynamic>{
  'deviceId': instance.deviceId,
  'userId': instance.userId,
  'signatureKey': instance.signatureKey,
  'inGroup': instance.inGroup,
};
