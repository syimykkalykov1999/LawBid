// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'desk_heartbeat_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeskHeartbeatResultDto _$DeskHeartbeatResultDtoFromJson(
  Map<String, dynamic> json,
) => DeskHeartbeatResultDto(
  status: DeskPresence.fromJson(json['status'] as String),
);

Map<String, dynamic> _$DeskHeartbeatResultDtoToJson(
  DeskHeartbeatResultDto instance,
) => <String, dynamic>{'status': instance.status.toJson()};
