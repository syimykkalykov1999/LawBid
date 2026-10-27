// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ad_archive_row_dto_kind.dart';

part 'ad_archive_row_dto.g.dart';

@JsonSerializable()
class AdArchiveRowDto {
  const AdArchiveRowDto({
    required this.id,
    required this.attorneyId,
    required this.kind,
    required this.sourceId,
    required this.version,
    required this.content,
    required this.disclaimers,
    required this.findings,
    required this.stateCodes,
    required this.createdAt,
    required this.retainUntil,
  });

  factory AdArchiveRowDto.fromJson(Map<String, Object?> json) =>
      _$AdArchiveRowDtoFromJson(json);

  final String id;
  final String attorneyId;
  final AdArchiveRowDtoKind kind;
  final String sourceId;
  final int version;
  final String content;
  final List<String> disclaimers;
  final List<String> findings;
  final List<String> stateCodes;
  final DateTime createdAt;
  final DateTime retainUntil;

  Map<String, Object?> toJson() => _$AdArchiveRowDtoToJson(this);
}
