// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'practice_match_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PracticeMatchListEnvelope _$PracticeMatchListEnvelopeFromJson(
  Map<String, dynamic> json,
) => PracticeMatchListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => PracticeMatchDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PracticeMatchListEnvelopeToJson(
  PracticeMatchListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
