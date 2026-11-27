// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_e2ee_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupE2eeDto _$GroupE2eeDtoFromJson(Map<String, dynamic> json) => GroupE2eeDto(
  state: GroupE2eeState.fromJson(json['state'] as String),
  devices: (json['devices'] as List<dynamic>)
      .map((e) => GroupMlsDeviceDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  removeDevices: (json['removeDevices'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  updateDays: json['updateDays'] as num,
  historyMax: json['historyMax'] as num,
  historySharing: json['historySharing'] as bool,
  reason: json['reason'] == null
      ? null
      : GroupE2eeOffReason.fromJson(json['reason'] as String),
  groupId: json['groupId'] as String?,
  epoch: json['epoch'] as num?,
  since: json['since'] == null ? null : DateTime.parse(json['since'] as String),
  leaseHolderDeviceId: json['leaseHolderDeviceId'] as String?,
  groupInfoEpoch: json['groupInfoEpoch'] as num?,
);

Map<String, dynamic> _$GroupE2eeDtoToJson(GroupE2eeDto instance) =>
    <String, dynamic>{
      'state': instance.state.toJson(),
      'reason': ?instance.reason?.toJson(),
      'groupId': ?instance.groupId,
      'epoch': ?instance.epoch,
      'since': ?instance.since?.toIso8601String(),
      'devices': instance.devices.map((e) => e.toJson()).toList(),
      'removeDevices': instance.removeDevices,
      'leaseHolderDeviceId': ?instance.leaseHolderDeviceId,
      'groupInfoEpoch': ?instance.groupInfoEpoch,
      'updateDays': instance.updateDays,
      'historyMax': instance.historyMax,
      'historySharing': instance.historySharing,
    };
