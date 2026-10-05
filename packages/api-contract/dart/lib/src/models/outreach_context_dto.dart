// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_partner_dto.dart';
import 'outreach_settings_dto.dart';

part 'outreach_context_dto.g.dart';

@JsonSerializable()
class OutreachContextDto {
  const OutreachContextDto({
    required this.scope,
    required this.manager,
    required this.partners,
    required this.settings,
    required this.emailsLeftToday,
  });

  factory OutreachContextDto.fromJson(Map<String, Object?> json) =>
      _$OutreachContextDtoFromJson(json);

  /// Set when this admin is a partner: they see only their own leads.
  final OutreachPartnerDto? scope;

  /// May import, assign and edit templates/settings.
  final bool manager;

  /// Active partners to assign leads to.
  final List<OutreachPartnerDto> partners;
  final OutreachSettingsDto settings;

  /// Cold emails this admin may still send today.
  final num emailsLeftToday;

  Map<String, Object?> toJson() => _$OutreachContextDtoToJson(this);
}
