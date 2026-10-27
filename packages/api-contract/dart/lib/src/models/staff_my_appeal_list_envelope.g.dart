// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_my_appeal_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffMyAppealListEnvelope _$StaffMyAppealListEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffMyAppealListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => StaffMyAppealDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffMyAppealListEnvelopeToJson(
  StaffMyAppealListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
