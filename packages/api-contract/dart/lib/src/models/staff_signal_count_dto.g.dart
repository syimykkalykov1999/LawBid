// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_signal_count_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffSignalCountDto _$StaffSignalCountDtoFromJson(Map<String, dynamic> json) =>
    StaffSignalCountDto(
      kind: json['kind'] as String,
      label: json['label'] as String,
      count: (json['count'] as num).toInt(),
    );

Map<String, dynamic> _$StaffSignalCountDtoToJson(
  StaffSignalCountDto instance,
) => <String, dynamic>{
  'kind': instance.kind,
  'label': instance.label,
  'count': instance.count,
};
