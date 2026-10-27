// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_my_progress_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffMyProgressEnvelope _$StaffMyProgressEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffMyProgressEnvelope(
  data: StaffMyProgressDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffMyProgressEnvelopeToJson(
  StaffMyProgressEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
