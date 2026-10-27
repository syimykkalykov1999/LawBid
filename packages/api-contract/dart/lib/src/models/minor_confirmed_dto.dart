// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'minor_confirmed_outcome.dart';

part 'minor_confirmed_dto.g.dart';

@JsonSerializable()
class MinorConfirmedDto {
  const MinorConfirmedDto({required this.userId, required this.outcome});

  factory MinorConfirmedDto.fromJson(Map<String, Object?> json) =>
      _$MinorConfirmedDtoFromJson(json);

  final String userId;

  /// erased: anonymized now; held: a legal hold defers it (the daily job retries); already: nothing left to do.
  final MinorConfirmedOutcome outcome;

  Map<String, Object?> toJson() => _$MinorConfirmedDtoToJson(this);
}
