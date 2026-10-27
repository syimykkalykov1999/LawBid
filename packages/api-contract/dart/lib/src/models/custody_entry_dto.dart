// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'custody_entry_dto.g.dart';

@JsonSerializable()
class CustodyEntryDto {
  const CustodyEntryDto({
    required this.at,
    required this.adminId,
    required this.action,
    required this.ip,
    required this.details,
  });

  factory CustodyEntryDto.fromJson(Map<String, Object?> json) =>
      _$CustodyEntryDtoFromJson(json);

  final String at;
  final String adminId;

  /// legal_export.built | .queue | .download
  final String action;
  final String? ip;
  final dynamic details;

  Map<String, Object?> toJson() => _$CustodyEntryDtoToJson(this);
}
