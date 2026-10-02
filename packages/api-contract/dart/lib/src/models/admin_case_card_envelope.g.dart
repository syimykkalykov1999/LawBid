// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_case_card_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCaseCardEnvelope _$AdminCaseCardEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminCaseCardEnvelope(
  data: AdminCaseCardDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminCaseCardEnvelopeToJson(
  AdminCaseCardEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
