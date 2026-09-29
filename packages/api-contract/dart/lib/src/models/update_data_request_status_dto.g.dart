// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_data_request_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateDataRequestStatusDto _$UpdateDataRequestStatusDtoFromJson(
  Map<String, dynamic> json,
) => UpdateDataRequestStatusDto(
  status: UpdateDataRequestStatusDtoStatus.fromJson(json['status'] as String),
  notes: json['notes'] as String?,
);

Map<String, dynamic> _$UpdateDataRequestStatusDtoToJson(
  UpdateDataRequestStatusDto instance,
) => <String, dynamic>{
  'status': instance.status.toJson(),
  'notes': ?instance.notes,
};
