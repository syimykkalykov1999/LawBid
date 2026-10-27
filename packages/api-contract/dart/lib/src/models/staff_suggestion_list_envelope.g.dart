// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_suggestion_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffSuggestionListEnvelope _$StaffSuggestionListEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffSuggestionListEnvelope(
  data: StaffSuggestionListDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffSuggestionListEnvelopeToJson(
  StaffSuggestionListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
