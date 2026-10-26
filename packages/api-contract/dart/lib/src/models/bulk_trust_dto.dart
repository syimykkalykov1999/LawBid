// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bulk_trust_dto_action.dart';
import 'bulk_trust_dto_template.dart';

part 'bulk_trust_dto.g.dart';

@JsonSerializable()
class BulkTrustDto {
  const BulkTrustDto({
    required this.attorneyIds,
    required this.action,
    this.template,
    this.note,
  });

  factory BulkTrustDto.fromJson(Map<String, Object?> json) =>
      _$BulkTrustDtoFromJson(json);

  final List<String> attorneyIds;
  final BulkTrustDtoAction action;
  final BulkTrustDtoTemplate? template;
  final String? note;

  Map<String, Object?> toJson() => _$BulkTrustDtoToJson(this);
}
