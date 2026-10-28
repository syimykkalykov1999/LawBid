// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'address_suggestions_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AddressSuggestionsEnvelope _$AddressSuggestionsEnvelopeFromJson(
  Map<String, dynamic> json,
) => AddressSuggestionsEnvelope(
  data: AddressSuggestionsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AddressSuggestionsEnvelopeToJson(
  AddressSuggestionsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
