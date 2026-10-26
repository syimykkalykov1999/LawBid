// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_lead_kind.dart';
import 'outreach_lead_source.dart';
import 'outreach_lead_status.dart';
import 'outreach_partner_dto.dart';

part 'outreach_lead_row_dto.g.dart';

@JsonSerializable()
class OutreachLeadRowDto {
  const OutreachLeadRowDto({
    required this.id,
    required this.kind,
    required this.firstName,
    required this.lastName,
    required this.company,
    required this.stateCode,
    required this.city,
    required this.practice,
    required this.phone,
    required this.email,
    required this.source,
    required this.status,
    required this.partner,
    required this.convertedUserId,
    required this.unsubscribed,
    required this.lastActivityAt,
    required this.nextActionAt,
    required this.note,
    required this.doNotContact,
    required this.doNotContactReason,
    required this.sourceNote,
    required this.emailsSent,
    required this.createdAt,
  });

  factory OutreachLeadRowDto.fromJson(Map<String, Object?> json) =>
      _$OutreachLeadRowDtoFromJson(json);

  final String id;
  final OutreachLeadKind kind;
  final String? firstName;
  final String? lastName;
  final String? company;
  final String? stateCode;
  final String? city;
  final String? practice;
  final String? phone;
  final String? email;
  final OutreachLeadSource source;
  final OutreachLeadStatus status;
  final OutreachPartnerDto? partner;
  final String? convertedUserId;
  final bool unsubscribed;
  final DateTime? lastActivityAt;
  final DateTime? nextActionAt;
  final String? note;

  /// Do-not-contact (TCPA / DNC): phone and email are hidden, no calls or emails.
  final bool doNotContact;

  /// manual | not_interested | wrong_number | unsubscribed | suppression | retention
  final String? doNotContactReason;

  /// Where the contact came from and on what basis we may write.
  final String? sourceNote;

  /// Cold emails sent to this lead so far.
  final num emailsSent;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$OutreachLeadRowDtoToJson(this);
}
