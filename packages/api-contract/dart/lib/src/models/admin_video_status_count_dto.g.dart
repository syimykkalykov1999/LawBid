// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_video_status_count_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminVideoStatusCountDto _$AdminVideoStatusCountDtoFromJson(
  Map<String, dynamic> json,
) => AdminVideoStatusCountDto(
  status: AdminVideoStatusCountDtoStatus.fromJson(json['status'] as String),
  count: (json['count'] as num).toInt(),
);

Map<String, dynamic> _$AdminVideoStatusCountDtoToJson(
  AdminVideoStatusCountDto instance,
) => <String, dynamic>{
  'status': instance.status.toJson(),
  'count': instance.count,
};
