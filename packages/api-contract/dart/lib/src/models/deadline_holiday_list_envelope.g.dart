// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deadline_holiday_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeadlineHolidayListEnvelope _$DeadlineHolidayListEnvelopeFromJson(
  Map<String, dynamic> json,
) => DeadlineHolidayListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => DeadlineHolidayDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DeadlineHolidayListEnvelopeToJson(
  DeadlineHolidayListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
