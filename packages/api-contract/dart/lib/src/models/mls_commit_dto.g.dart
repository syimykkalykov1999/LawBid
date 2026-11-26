// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mls_commit_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MlsCommitDto _$MlsCommitDtoFromJson(Map<String, dynamic> json) => MlsCommitDto(
  deviceId: json['deviceId'] as String,
  epoch: json['epoch'] as num,
  commit: json['commit'] as String,
  addedDevices: (json['addedDevices'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  removedDevices: (json['removedDevices'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  welcome: json['welcome'] as String?,
);

Map<String, dynamic> _$MlsCommitDtoToJson(MlsCommitDto instance) =>
    <String, dynamic>{
      'deviceId': instance.deviceId,
      'epoch': instance.epoch,
      'commit': instance.commit,
      'addedDevices': instance.addedDevices,
      'removedDevices': instance.removedDevices,
      'welcome': ?instance.welcome,
    };
