// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'call_mute_dto.g.dart';

@JsonSerializable()
class CallMuteDto {
  const CallMuteDto({required this.muted});

  factory CallMuteDto.fromJson(Map<String, Object?> json) =>
      _$CallMuteDtoFromJson(json);

  final bool muted;

  Map<String, Object?> toJson() => _$CallMuteDtoToJson(this);
}
