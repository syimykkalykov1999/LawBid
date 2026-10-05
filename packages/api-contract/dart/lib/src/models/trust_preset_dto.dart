// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'trust_preset_dto_preset.dart';

part 'trust_preset_dto.g.dart';

@JsonSerializable()
class TrustPresetDto {
  const TrustPresetDto({required this.preset});

  factory TrustPresetDto.fromJson(Map<String, Object?> json) =>
      _$TrustPresetDtoFromJson(json);

  /// off = «Выключить всё»; soft / standard / strict; all = «Включить всё».
  final TrustPresetDtoPreset preset;

  Map<String, Object?> toJson() => _$TrustPresetDtoToJson(this);
}
