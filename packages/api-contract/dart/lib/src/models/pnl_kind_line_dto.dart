// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'pnl_kind_line_dto_kind.dart';

part 'pnl_kind_line_dto.g.dart';

@JsonSerializable()
class PnlKindLineDto {
  const PnlKindLineDto({required this.kind, required this.revenueUsd});

  factory PnlKindLineDto.fromJson(Map<String, Object?> json) =>
      _$PnlKindLineDtoFromJson(json);

  final PnlKindLineDtoKind kind;
  final num revenueUsd;

  Map<String, Object?> toJson() => _$PnlKindLineDtoToJson(this);
}
