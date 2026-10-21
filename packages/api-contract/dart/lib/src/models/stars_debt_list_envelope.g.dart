// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stars_debt_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StarsDebtListEnvelope _$StarsDebtListEnvelopeFromJson(
  Map<String, dynamic> json,
) => StarsDebtListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => StarsDebtDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StarsDebtListEnvelopeToJson(
  StarsDebtListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
