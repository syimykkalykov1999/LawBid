// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_mls_commit_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupMlsCommitDto _$GroupMlsCommitDtoFromJson(Map<String, dynamic> json) =>
    GroupMlsCommitDto(
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
      groupInfo: json['groupInfo'] as String?,
      groupInfoFileId: json['groupInfoFileId'] as String?,
    );

Map<String, dynamic> _$GroupMlsCommitDtoToJson(GroupMlsCommitDto instance) =>
    <String, dynamic>{
      'deviceId': instance.deviceId,
      'epoch': instance.epoch,
      'commit': instance.commit,
      'addedDevices': instance.addedDevices,
      'removedDevices': instance.removedDevices,
      'welcome': ?instance.welcome,
      'groupInfo': ?instance.groupInfo,
      'groupInfoFileId': ?instance.groupInfoFileId,
    };
