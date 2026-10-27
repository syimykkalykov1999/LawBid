// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_reveal_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffRevealResultEnvelope _$StaffRevealResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffRevealResultEnvelope(
  data: StaffRevealResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffRevealResultEnvelopeToJson(
  StaffRevealResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
