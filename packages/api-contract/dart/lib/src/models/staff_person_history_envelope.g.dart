// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_person_history_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffPersonHistoryEnvelope _$StaffPersonHistoryEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffPersonHistoryEnvelope(
  data: StaffPersonHistoryDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffPersonHistoryEnvelopeToJson(
  StaffPersonHistoryEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
