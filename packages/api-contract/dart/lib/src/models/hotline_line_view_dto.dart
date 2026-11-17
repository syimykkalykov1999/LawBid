// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hotline_access_via.dart';
import 'hotline_line_state.dart';

part 'hotline_line_view_dto.g.dart';

@JsonSerializable()
class HotlineLineViewDto {
  const HotlineLineViewDto({
    required this.online,
    required this.state,
    required this.accepting,
    required this.states,
    required this.practiceAreas,
    required this.languages,
    required this.heartbeatSec,
    required this.offerTimeoutSec,
    this.via,
  });

  factory HotlineLineViewDto.fromJson(Map<String, Object?> json) =>
      _$HotlineLineViewDtoFromJson(json);

  final bool online;
  final HotlineLineState state;
  final bool accepting;
  final List<String> states;
  final List<String> practiceAreas;
  final List<String> languages;
  final num heartbeatSec;
  final num offerTimeoutSec;
  final HotlineAccessVia? via;

  Map<String, Object?> toJson() => _$HotlineLineViewDtoToJson(this);
}
