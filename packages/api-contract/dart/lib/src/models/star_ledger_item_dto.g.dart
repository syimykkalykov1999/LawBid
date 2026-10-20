// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'star_ledger_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StarLedgerItemDto _$StarLedgerItemDtoFromJson(Map<String, dynamic> json) =>
    StarLedgerItemDto(
      id: json['id'] as String,
      delta: (json['delta'] as num).toInt(),
      balanceAfter: (json['balanceAfter'] as num).toInt(),
      kind: StarLedgerItemDtoKind.fromJson(json['kind'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      note: json['note'] as String?,
    );

Map<String, dynamic> _$StarLedgerItemDtoToJson(StarLedgerItemDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'delta': instance.delta,
      'balanceAfter': instance.balanceAfter,
      'kind': instance.kind.toJson(),
      'note': ?instance.note,
      'createdAt': instance.createdAt.toIso8601String(),
    };
