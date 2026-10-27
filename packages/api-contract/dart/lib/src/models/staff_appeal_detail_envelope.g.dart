// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_appeal_detail_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffAppealDetailEnvelope _$StaffAppealDetailEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffAppealDetailEnvelope(
  data: StaffAppealDetailDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffAppealDetailEnvelopeToJson(
  StaffAppealDetailEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
