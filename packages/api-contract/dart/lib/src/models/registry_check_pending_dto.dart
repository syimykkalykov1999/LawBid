// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'registry_check_pending_dto_kind.dart';

part 'registry_check_pending_dto.g.dart';

@JsonSerializable()
class RegistryCheckPendingDto {
  const RegistryCheckPendingDto({
    required this.checkId,
    required this.kind,
    required this.queuedAt,
  });

  factory RegistryCheckPendingDto.fromJson(Map<String, Object?> json) =>
      _$RegistryCheckPendingDtoFromJson(json);

  final String checkId;
  final RegistryCheckPendingDtoKind kind;
  final DateTime queuedAt;

  Map<String, Object?> toJson() => _$RegistryCheckPendingDtoToJson(this);
}
