// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'mute_calls_dto.g.dart';

@JsonSerializable()
class MuteCallsDto {
  const MuteCallsDto({required this.muted});

  factory MuteCallsDto.fromJson(Map<String, Object?> json) =>
      _$MuteCallsDtoFromJson(json);

  /// Calls of this chat ring silently for me.
  final bool muted;

  Map<String, Object?> toJson() => _$MuteCallsDtoToJson(this);
}
