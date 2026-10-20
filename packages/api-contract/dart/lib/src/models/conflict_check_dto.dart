// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'conflict_match_dto.dart';

part 'conflict_check_dto.g.dart';

@JsonSerializable()
class ConflictCheckDto {
  const ConflictCheckDto({required this.conflict, required this.matches});

  factory ConflictCheckDto.fromJson(Map<String, Object?> json) =>
      _$ConflictCheckDtoFromJson(json);

  final bool conflict;
  final List<ConflictMatchDto> matches;

  Map<String, Object?> toJson() => _$ConflictCheckDtoToJson(this);
}
