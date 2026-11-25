// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'chat_media_state.dart';

part 'voice_note_dto.g.dart';

@JsonSerializable()
class VoiceNoteDto {
  const VoiceNoteDto({
    required this.durationMs,
    required this.waveform,
    required this.listened,
    this.url,
    this.m4aUrl,
    this.state,
  });

  factory VoiceNoteDto.fromJson(Map<String, Object?> json) =>
      _$VoiceNoteDtoFromJson(json);

  /// Short signed link; null in chat-list previews.
  final String? url;

  /// Owner row 146: short signed link to the AAC/M4A copy of a note recorded in a browser as Opus/WebM (players without WebM, the iPhone, use it). Null when the note is already AAC, the copy is not made, or in chat-list previews.
  final String? m4aUrl;
  final int durationMs;
  final List<int> waveform;

  /// The recipient has played it.
  final bool listened;

  /// M3: processing (only the sender has a link) → ready, or removed (infected / failed / deleted).
  final ChatMediaState? state;

  Map<String, Object?> toJson() => _$VoiceNoteDtoToJson(this);
}
