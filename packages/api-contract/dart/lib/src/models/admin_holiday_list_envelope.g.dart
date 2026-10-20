// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_holiday_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminHolidayListEnvelope _$AdminHolidayListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminHolidayListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminHolidayDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminHolidayListEnvelopeToJson(
  AdminHolidayListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
