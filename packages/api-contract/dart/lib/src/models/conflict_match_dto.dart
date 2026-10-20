// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'conflict_match_dto_by.dart';
import 'conflict_match_dto_kind.dart';

part 'conflict_match_dto.g.dart';

@JsonSerializable()
class ConflictMatchDto {
  const ConflictMatchDto({
    required this.kind,
    required this.by,
    required this.caseId,
    required this.caseTitle,
  });

  factory ConflictMatchDto.fromJson(Map<String, Object?> json) =>
      _$ConflictMatchDtoFromJson(json);

  /// former_client: a client of yours is named in this case. opposing_party: this case’s client is named in a case you handled.
  final ConflictMatchDtoKind kind;
  final ConflictMatchDtoBy by;

  /// Your earlier case.
  final String caseId;
  final String caseTitle;

  Map<String, Object?> toJson() => _$ConflictMatchDtoToJson(this);
}
