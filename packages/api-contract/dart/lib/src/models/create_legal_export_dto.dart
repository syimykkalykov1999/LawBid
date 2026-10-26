// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_legal_export_dto_sections.dart';

part 'create_legal_export_dto.g.dart';

@JsonSerializable()
class CreateLegalExportDto {
  const CreateLegalExportDto({
    required this.userId,
    required this.sections,
    this.conversationIds,
    this.groupIds,
    this.dateFrom,
    this.dateTo,
  });

  factory CreateLegalExportDto.fromJson(Map<String, Object?> json) =>
      _$CreateLegalExportDtoFromJson(json);

  final String userId;
  final List<CreateLegalExportDtoSections> sections;

  /// Only these direct chats; omitted = all of the person’s.
  final List<String>? conversationIds;

  /// Only these groups; omitted = all.
  final List<String>? groupIds;
  final DateTime? dateFrom;
  final DateTime? dateTo;

  Map<String, Object?> toJson() => _$CreateLegalExportDtoToJson(this);
}
