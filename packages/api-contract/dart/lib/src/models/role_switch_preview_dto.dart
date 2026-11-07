// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'role_switch_preview_dto_from.dart';
import 'role_switch_preview_dto_to.dart';

part 'role_switch_preview_dto.g.dart';

@JsonSerializable()
class RoleSwitchPreviewDto {
  const RoleSwitchPreviewDto({
    required this.from,
    required this.to,
    required this.allowed,
    required this.blockers,
    required this.needsOnboarding,
    required this.retryAfterSeconds,
  });

  factory RoleSwitchPreviewDto.fromJson(Map<String, Object?> json) =>
      _$RoleSwitchPreviewDtoFromJson(json);

  final RoleSwitchPreviewDtoFrom from;
  final RoleSwitchPreviewDtoTo to;
  final bool allowed;

  /// What must be finished first: active_cases, active_bids, open_disputes, upcoming_consultations, paid_subscription, assistants, firm.
  final List<String> blockers;

  /// The other profile does not exist yet: the usual onboarding opens after the switch.
  final bool needsOnboarding;

  /// Seconds until the daily limit allows a switch; 0 = now.
  final int retryAfterSeconds;

  Map<String, Object?> toJson() => _$RoleSwitchPreviewDtoToJson(this);
}
