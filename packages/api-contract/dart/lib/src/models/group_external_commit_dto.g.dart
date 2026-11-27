// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_external_commit_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupExternalCommitDto _$GroupExternalCommitDtoFromJson(
  Map<String, dynamic> json,
) => GroupExternalCommitDto(
  deviceId: json['deviceId'] as String,
  epoch: json['epoch'] as num,
  commit: json['commit'] as String,
  groupInfo: json['groupInfo'] as String?,
  groupInfoFileId: json['groupInfoFileId'] as String?,
  resync: json['resync'] as bool?,
);

Map<String, dynamic> _$GroupExternalCommitDtoToJson(
  GroupExternalCommitDto instance,
) => <String, dynamic>{
  'groupInfo': ?instance.groupInfo,
  'groupInfoFileId': ?instance.groupInfoFileId,
  'deviceId': instance.deviceId,
  'epoch': instance.epoch,
  'commit': instance.commit,
  'resync': ?instance.resync,
};
