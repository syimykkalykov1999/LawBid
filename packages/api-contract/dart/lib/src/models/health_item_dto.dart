// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'health_item_dto_key.dart';
import 'health_item_dto_status.dart';

part 'health_item_dto.g.dart';

@JsonSerializable()
class HealthItemDto {
  const HealthItemDto({
    required this.key,
    required this.status,
    required this.detail,
  });

  factory HealthItemDto.fromJson(Map<String, Object?> json) =>
      _$HealthItemDtoFromJson(json);

  final HealthItemDtoKey key;
  final HealthItemDtoStatus status;

  /// Numbers behind the status (the admin words them).
  final dynamic detail;

  Map<String, Object?> toJson() => _$HealthItemDtoToJson(this);
}
