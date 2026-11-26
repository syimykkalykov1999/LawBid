// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'conversation_e2ee_off_reason.dart';
import 'conversation_e2ee_state.dart';
import 'mls_group_member_device_dto.dart';
import 'push_preview_key_dto.dart';

part 'conversation_e2ee_dto.g.dart';

@JsonSerializable()
class ConversationE2eeDto {
  const ConversationE2eeDto({
    required this.state,
    required this.devices,
    required this.removeDevices,
    this.reason,
    this.groupId,
    this.epoch,
    this.since,
    this.previewKeys,
  });

  factory ConversationE2eeDto.fromJson(Map<String, Object?> json) =>
      _$ConversationE2eeDtoFromJson(json);

  /// off = write as before (server-side encryption); pending = the first device may create the MLS group now; on = the chat is end-to-end encrypted (send type=mls).
  final ConversationE2eeState state;
  final ConversationE2eeOffReason? reason;

  /// Base64 MLS group_id.
  final String? groupId;
  final num? epoch;
  final DateTime? since;

  /// Active devices of the chat’s members (in the group or still to add).
  final List<MlsGroupMemberDeviceDto> devices;

  /// Devices still in the group that must be removed first (signed out, or their person left the chat). MLS messages are refused until a commit removes them.
  final List<String> removeDevices;

  /// M12: the other members’ phones a sender seals the push preview of each message to (empty when message previews in pushes are off).
  final List<PushPreviewKeyDto>? previewKeys;

  Map<String, Object?> toJson() => _$ConversationE2eeDtoToJson(this);
}
