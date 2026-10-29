// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'story_settings_dto.dart';

part 'story_settings_envelope.g.dart';

@JsonSerializable()
class StorySettingsEnvelope {
  const StorySettingsEnvelope({
    required this.data,
    this.meta,
  });
  
  factory StorySettingsEnvelope.fromJson(Map<String, Object?> json) => _$StorySettingsEnvelopeFromJson(json);
  
  final StorySettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StorySettingsEnvelopeToJson(this);
}
