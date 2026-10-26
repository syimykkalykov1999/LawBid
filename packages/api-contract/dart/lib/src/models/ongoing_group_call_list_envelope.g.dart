// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ongoing_group_call_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OngoingGroupCallListEnvelope _$OngoingGroupCallListEnvelopeFromJson(
  Map<String, dynamic> json,
) => OngoingGroupCallListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => OngoingGroupCallDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$OngoingGroupCallListEnvelopeToJson(
  OngoingGroupCallListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
