// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hotline_access_via.dart';
import 'hotline_mode.dart';

part 'hotline_access_dto.g.dart';

@JsonSerializable()
class HotlineAccessDto {
  const HotlineAccessDto({
    required this.mode,
    required this.allowed,
    this.via,
    this.reason,
  });

  factory HotlineAccessDto.fromJson(Map<String, Object?> json) =>
      _$HotlineAccessDtoFromJson(json);

  final HotlineMode mode;
  final bool allowed;
  final HotlineAccessVia? via;

  /// off_for_all, not_in_plan, addon_required (when not allowed)
  final String? reason;

  Map<String, Object?> toJson() => _$HotlineAccessDtoToJson(this);
}
