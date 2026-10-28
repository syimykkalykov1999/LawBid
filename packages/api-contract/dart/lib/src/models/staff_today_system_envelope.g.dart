// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_today_system_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffTodaySystemEnvelope _$StaffTodaySystemEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffTodaySystemEnvelope(
  data: StaffTodaySystemDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffTodaySystemEnvelopeToJson(
  StaffTodaySystemEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
