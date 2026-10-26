// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_activity_dto.dart';
import 'outreach_contact_block_reason.dart';
import 'outreach_lead_kind.dart';
import 'outreach_lead_source.dart';
import 'outreach_lead_status.dart';
import 'outreach_partner_dto.dart';

part 'outreach_lead_detail_dto.g.dart';

@JsonSerializable()
class OutreachLeadDetailDto {
  const OutreachLeadDetailDto({
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
    required this.activities,
    required this.canEmail,
    required this.callAllowed,
    required this.callWindow,
    required this.callBlocked,
    required this.emailBlocked,
    required this.phoneHidden,
  });

  factory OutreachLeadDetailDto.fromJson(Map<String, Object?> json) =>
      _$OutreachLeadDetailDtoFromJson(json);

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
  final List<OutreachActivityDto> activities;

  /// Cold emails this lead may still receive (emailBlocked === null).
  final bool canEmail;

  /// A call may be logged now (not do-not-contact, clients enabled, inside the local call window).
  final bool callAllowed;

  /// The local call window and time, e.g. "08:00–21:00 America/New_York, now 22:15".
  final String? callWindow;

  /// Why a call is blocked now; null = allowed.
  final OutreachContactBlockReason? callBlocked;

  /// Why an email is blocked now; null = allowed.
  final OutreachContactBlockReason? emailBlocked;

  /// A phone exists but is withheld (callBlocked / do-not-contact).
  final bool phoneHidden;

  Map<String, Object?> toJson() => _$OutreachLeadDetailDtoToJson(this);
}
