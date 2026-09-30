// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'voice_note_dto.g.dart';

@JsonSerializable()
class VoiceNoteDto {
  const VoiceNoteDto({
    required this.durationMs,
    required this.waveform,
    required this.listened,
    this.url,
  });

  factory VoiceNoteDto.fromJson(Map<String, Object?> json) =>
      _$VoiceNoteDtoFromJson(json);

  /// Short signed link; null in chat-list previews.
  final String? url;
  final int durationMs;
  final List<int> waveform;

  /// The recipient has played it.
  final bool listened;

  Map<String, Object?> toJson() => _$VoiceNoteDtoToJson(this);
}
