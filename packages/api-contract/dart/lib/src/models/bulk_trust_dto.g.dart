// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bulk_trust_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BulkTrustDto _$BulkTrustDtoFromJson(Map<String, dynamic> json) => BulkTrustDto(
  attorneyIds: (json['attorneyIds'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  action: BulkTrustDtoAction.fromJson(json['action'] as String),
  template: json['template'] == null
      ? null
      : BulkTrustDtoTemplate.fromJson(json['template'] as String),
  note: json['note'] as String?,
);

Map<String, dynamic> _$BulkTrustDtoToJson(BulkTrustDto instance) =>
    <String, dynamic>{
      'attorneyIds': instance.attorneyIds,
      'action': instance.action.toJson(),
      'template': ?instance.template?.toJson(),
      'note': ?instance.note,
    };
