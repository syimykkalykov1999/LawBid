// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_decide_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffDecideResultEnvelope _$StaffDecideResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffDecideResultEnvelope(
  data: StaffDecideResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffDecideResultEnvelopeToJson(
  StaffDecideResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
