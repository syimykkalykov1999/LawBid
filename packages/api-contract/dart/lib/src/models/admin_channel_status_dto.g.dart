// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_channel_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminChannelStatusDto _$AdminChannelStatusDtoFromJson(
  Map<String, dynamic> json,
) => AdminChannelStatusDto(
  status: AdminChannelStatus.fromJson(json['status'] as String),
  reason: json['reason'] as String? ?? '',
);

Map<String, dynamic> _$AdminChannelStatusDtoToJson(
  AdminChannelStatusDto instance,
) => <String, dynamic>{
  'status': instance.status.toJson(),
  'reason': instance.reason,
};
