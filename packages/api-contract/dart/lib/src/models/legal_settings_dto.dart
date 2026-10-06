// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'dmca_agent_dto.dart';
import 'incident_contact_dto.dart';
import 'legal_texts_by_lang_dto.dart';

part 'legal_settings_dto.g.dart';

@JsonSerializable()
class LegalSettingsDto {
  const LegalSettingsDto({
    required this.dmcaAgent,
    required this.incidentContact,
    required this.dmcaStrikesToSuspend,
    required this.texts,
  });

  factory LegalSettingsDto.fromJson(Map<String, Object?> json) =>
      _$LegalSettingsDtoFromJson(json);

  final DmcaAgentDto dmcaAgent;
  final IncidentContactDto incidentContact;

  /// DMCA removals after which the author is suspended; 0 = never automatically.
  final int dmcaStrikesToSuspend;
  final LegalTextsByLangDto texts;

  Map<String, Object?> toJson() => _$LegalSettingsDtoToJson(this);
}
