// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'search_index_verify_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SearchIndexVerifyDto _$SearchIndexVerifyDtoFromJson(
  Map<String, dynamic> json,
) => SearchIndexVerifyDto(
  entity: SearchIndexVerifyDtoEntity.fromJson(json['entity'] as String),
  live: json['live'] as num,
  next: json['next'] as num,
  sampled: json['sampled'] as num,
  mismatched: json['mismatched'] as num,
  ok: json['ok'] as bool,
  note: json['note'] as String?,
);

Map<String, dynamic> _$SearchIndexVerifyDtoToJson(
  SearchIndexVerifyDto instance,
) => <String, dynamic>{
  'entity': instance.entity.toJson(),
  'live': instance.live,
  'next': instance.next,
  'sampled': instance.sampled,
  'mismatched': instance.mismatched,
  'ok': instance.ok,
  'note': ?instance.note,
};
