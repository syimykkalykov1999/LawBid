// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_activity_input_kind.dart';
import 'outreach_call_outcome.dart';

part 'outreach_activity_input_dto.g.dart';

@JsonSerializable()
class OutreachActivityInputDto {
  const OutreachActivityInputDto({
    required this.kind,
    this.outcome,
    this.body,
    this.nextActionAt,
  });

  factory OutreachActivityInputDto.fromJson(Map<String, Object?> json) =>
      _$OutreachActivityInputDtoFromJson(json);

  final OutreachActivityInputKind kind;
  final OutreachCallOutcome? outcome;
  final String? body;
  final DateTime? nextActionAt;

  Map<String, Object?> toJson() => _$OutreachActivityInputDtoToJson(this);
}
