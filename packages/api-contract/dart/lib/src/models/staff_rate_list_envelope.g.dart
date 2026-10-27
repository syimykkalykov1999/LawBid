// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_rate_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffRateListEnvelope _$StaffRateListEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffRateListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => StaffRateDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffRateListEnvelopeToJson(
  StaffRateListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
