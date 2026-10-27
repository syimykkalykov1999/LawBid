// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pnl_kind_line_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PnlKindLineDto _$PnlKindLineDtoFromJson(Map<String, dynamic> json) =>
    PnlKindLineDto(
      kind: PnlKindLineDtoKind.fromJson(json['kind'] as String),
      revenueUsd: json['revenueUsd'] as num,
    );

Map<String, dynamic> _$PnlKindLineDtoToJson(PnlKindLineDto instance) =>
    <String, dynamic>{
      'kind': instance.kind.toJson(),
      'revenueUsd': instance.revenueUsd,
    };
