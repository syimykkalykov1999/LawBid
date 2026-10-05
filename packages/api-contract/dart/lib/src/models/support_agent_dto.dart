// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'support_agent_dto.g.dart';

@JsonSerializable()
class SupportAgentDto {
  const SupportAgentDto({
    required this.adminId,
    required this.name,
    required this.onShift,
    required this.maxOpen,
    required this.openTickets,
  });

  factory SupportAgentDto.fromJson(Map<String, Object?> json) =>
      _$SupportAgentDtoFromJson(json);

  final String adminId;
  final String name;
  final bool onShift;

  /// Auto-assignment skips the agent at this many open tickets.
  final num maxOpen;

  /// Open tickets assigned now.
  final num openTickets;

  Map<String, Object?> toJson() => _$SupportAgentDtoToJson(this);
}
