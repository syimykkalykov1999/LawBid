// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'crash_group_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CrashGroupListEnvelope _$CrashGroupListEnvelopeFromJson(
  Map<String, dynamic> json,
) => CrashGroupListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => CrashGroupDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CrashGroupListEnvelopeToJson(
  CrashGroupListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
