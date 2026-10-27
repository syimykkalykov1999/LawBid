// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_shortlist_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffShortlistEnvelope _$StaffShortlistEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffShortlistEnvelope(
  data: StaffShortlistDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffShortlistEnvelopeToJson(
  StaffShortlistEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
