// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'voice_note_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VoiceNoteDto _$VoiceNoteDtoFromJson(Map<String, dynamic> json) => VoiceNoteDto(
  durationMs: (json['durationMs'] as num).toInt(),
  waveform: (json['waveform'] as List<dynamic>)
      .map((e) => (e as num).toInt())
      .toList(),
  listened: json['listened'] as bool,
  url: json['url'] as String?,
);

Map<String, dynamic> _$VoiceNoteDtoToJson(VoiceNoteDto instance) =>
    <String, dynamic>{
      'url': ?instance.url,
      'durationMs': instance.durationMs,
      'waveform': instance.waveform,
      'listened': instance.listened,
    };
