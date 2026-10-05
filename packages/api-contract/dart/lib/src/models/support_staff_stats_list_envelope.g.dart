// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_staff_stats_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportStaffStatsListEnvelope _$SupportStaffStatsListEnvelopeFromJson(
  Map<String, dynamic> json,
) => SupportStaffStatsListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => SupportStaffStatsDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SupportStaffStatsListEnvelopeToJson(
  SupportStaffStatsListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
