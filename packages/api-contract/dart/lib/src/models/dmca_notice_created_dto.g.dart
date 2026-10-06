// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'dmca_notice_created_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DmcaNoticeCreatedDto _$DmcaNoticeCreatedDtoFromJson(
  Map<String, dynamic> json,
) => DmcaNoticeCreatedDto(
  id: json['id'] as String,
  status: DmcaStatus.fromJson(json['status'] as String),
);

Map<String, dynamic> _$DmcaNoticeCreatedDtoToJson(
  DmcaNoticeCreatedDto instance,
) => <String, dynamic>{'id': instance.id, 'status': instance.status.toJson()};
