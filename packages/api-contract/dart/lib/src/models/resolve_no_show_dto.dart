// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'resolve_no_show_dto_decision.dart';

part 'resolve_no_show_dto.g.dart';

@JsonSerializable()
class ResolveNoShowDto {
  const ResolveNoShowDto({required this.decision, this.note});

  factory ResolveNoShowDto.fromJson(Map<String, Object?> json) =>
      _$ResolveNoShowDtoFromJson(json);

  /// uphold: the mark stands and counts; overturn: it does not count.
  final ResolveNoShowDtoDecision decision;
  final String? note;

  Map<String, Object?> toJson() => _$ResolveNoShowDtoToJson(this);
}
