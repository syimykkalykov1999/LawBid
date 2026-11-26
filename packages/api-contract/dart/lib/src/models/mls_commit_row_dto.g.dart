// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mls_commit_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MlsCommitRowDto _$MlsCommitRowDtoFromJson(Map<String, dynamic> json) =>
    MlsCommitRowDto(
      epoch: json['epoch'] as num,
      senderDeviceId: json['senderDeviceId'] as String,
      commit: json['commit'] as String,
      addedDevices: (json['addedDevices'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      removedDevices: (json['removedDevices'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$MlsCommitRowDtoToJson(MlsCommitRowDto instance) =>
    <String, dynamic>{
      'epoch': instance.epoch,
      'senderDeviceId': instance.senderDeviceId,
      'commit': instance.commit,
      'addedDevices': instance.addedDevices,
      'removedDevices': instance.removedDevices,
      'createdAt': instance.createdAt.toIso8601String(),
    };
