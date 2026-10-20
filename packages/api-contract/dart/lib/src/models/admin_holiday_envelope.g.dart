// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_holiday_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminHolidayEnvelope _$AdminHolidayEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminHolidayEnvelope(
  data: AdminHolidayDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminHolidayEnvelopeToJson(
  AdminHolidayEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
