// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_person_detail_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffPersonDetailEnvelope _$StaffPersonDetailEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffPersonDetailEnvelope(
  data: StaffPersonDetailDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffPersonDetailEnvelopeToJson(
  StaffPersonDetailEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
