// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'selected_practice_area_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SelectedPracticeAreaListEnvelope _$SelectedPracticeAreaListEnvelopeFromJson(
  Map<String, dynamic> json,
) => SelectedPracticeAreaListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => SelectedPracticeAreaDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SelectedPracticeAreaListEnvelopeToJson(
  SelectedPracticeAreaListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
