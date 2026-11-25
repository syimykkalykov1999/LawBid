// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hotline_access_dto.dart';
import 'hotline_disclosure_dto.dart';
import 'hotline_mode.dart';

part 'hotline_config_dto.g.dart';

@JsonSerializable()
class HotlineConfigDto {
  const HotlineConfigDto({
    required this.enabled,
    required this.heartbeatSec,
    required this.offerTimeoutSec,
    required this.maxLanguages,
    required this.topicMaxChars,
    required this.countersIntervalSec,
    required this.notifyClaimSec,
    required this.reviewEnabled,
    required this.clientStepsEnabled,
    required this.disclosure,
    this.mode,
    this.access,
  });

  factory HotlineConfigDto.fromJson(Map<String, Object?> json) =>
      _$HotlineConfigDtoFromJson(json);

  /// Флаги → «Горячая линия».
  final bool enabled;
  final num heartbeatSec;
  final num offerTimeoutSec;
  final num maxLanguages;
  final num topicMaxChars;
  final num countersIntervalSec;
  final num notifyClaimSec;

  /// hotline.review_enabled
  final bool reviewEnabled;

  /// hotline.client_steps_enabled («Дальше / Назад»)
  final bool clientStepsEnabled;
  final HotlineDisclosureDto disclosure;

  /// `hotline.mode` for every role (off_for_all: no buttons). Optional for apps that met an older server.
  final HotlineMode? mode;

  /// Attorneys only (null for clients and assistants).
  final HotlineAccessDto? access;

  Map<String, Object?> toJson() => _$HotlineConfigDtoToJson(this);
}
