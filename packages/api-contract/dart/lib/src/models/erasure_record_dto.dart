// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'erasure_record_dto_status.dart';

part 'erasure_record_dto.g.dart';

@JsonSerializable()
class ErasureRecordDto {
  const ErasureRecordDto({
    required this.status,
    required this.stores,
    required this.certificate,
  });

  factory ErasureRecordDto.fromJson(Map<String, Object?> json) =>
      _$ErasureRecordDtoFromJson(json);

  /// blocked = a legal hold defers the erasure.
  final ErasureRecordDtoStatus status;

  /// Per-store result (registry store id -> status, count, detail).
  final dynamic stores;
  final dynamic certificate;

  Map<String, Object?> toJson() => _$ErasureRecordDtoToJson(this);
}
