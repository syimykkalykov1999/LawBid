// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_people_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffPeopleListEnvelope _$StaffPeopleListEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffPeopleListEnvelope(
  data: StaffPeopleListDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffPeopleListEnvelopeToJson(
  StaffPeopleListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
