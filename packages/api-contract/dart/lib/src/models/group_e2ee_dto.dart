// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_e2ee_off_reason.dart';
import 'group_e2ee_state.dart';
import 'group_mls_device_dto.dart';

part 'group_e2ee_dto.g.dart';

@JsonSerializable()
class GroupE2eeDto {
  const GroupE2eeDto({
    required this.state,
    required this.devices,
    required this.removeDevices,
    required this.updateDays,
    required this.historyMax,
    required this.historySharing,
    this.reason,
    this.groupId,
    this.epoch,
    this.since,
    this.leaseHolderDeviceId,
    this.groupInfoEpoch,
  });

  factory GroupE2eeDto.fromJson(Map<String, Object?> json) =>
      _$GroupE2eeDtoFromJson(json);

  /// off = write as before; pending = the first device may create the MLS group now; on = end-to-end encrypted (send type=mls).
  final GroupE2eeState state;
  final GroupE2eeOffReason? reason;

  /// Base64 MLS group_id.
  final String? groupId;
  final num? epoch;
  final DateTime? since;

  /// Active devices of the live members (in the MLS group or still to add / to join).
  final List<GroupMlsDeviceDto> devices;

  /// Devices still in the MLS group that must be removed first (their person left / was removed, or the device was signed out). MLS messages are refused until a commit removes them.
  final List<String> removeDevices;

  /// The device holding the right to commit now, if any.
  final String? leaseHolderDeviceId;

  /// The epoch of the stored GroupInfo (external joins).
  final num? groupInfoEpoch;

  /// groups.e2ee_update_days (0 = never).
  final num updateDays;

  /// groups.e2ee_history_max.
  final num historyMax;

  /// The group lets members send history to people they add.
  final bool historySharing;

  Map<String, Object?> toJson() => _$GroupE2eeDtoToJson(this);
}
