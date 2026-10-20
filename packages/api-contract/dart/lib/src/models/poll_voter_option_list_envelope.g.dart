// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'poll_voter_option_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PollVoterOptionListEnvelope _$PollVoterOptionListEnvelopeFromJson(
  Map<String, dynamic> json,
) => PollVoterOptionListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => PollVoterOptionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PollVoterOptionListEnvelopeToJson(
  PollVoterOptionListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
