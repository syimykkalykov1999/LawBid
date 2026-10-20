// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'star_ledger_item_dto_kind.dart';

part 'star_ledger_item_dto.g.dart';

@JsonSerializable()
class StarLedgerItemDto {
  const StarLedgerItemDto({
    required this.id,
    required this.delta,
    required this.balanceAfter,
    required this.kind,
    required this.createdAt,
    this.note,
  });

  factory StarLedgerItemDto.fromJson(Map<String, Object?> json) =>
      _$StarLedgerItemDtoFromJson(json);

  final String id;
  final int delta;
  final int balanceAfter;
  final StarLedgerItemDtoKind kind;
  final String? note;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$StarLedgerItemDtoToJson(this);
}
