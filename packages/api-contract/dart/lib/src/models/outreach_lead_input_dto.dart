// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_lead_kind.dart';
import 'outreach_lead_status.dart';

part 'outreach_lead_input_dto.g.dart';

@JsonSerializable()
class OutreachLeadInputDto {
  const OutreachLeadInputDto({
    this.kind,
    this.firstName,
    this.lastName,
    this.company,
    this.stateCode,
    this.city,
    this.practice,
    this.phone,
    this.email,
    this.note,
    this.nextActionAt,
    this.partnerId,
    this.status,
    this.sourceNote,
    this.doNotContact,
  });

  factory OutreachLeadInputDto.fromJson(Map<String, Object?> json) =>
      _$OutreachLeadInputDtoFromJson(json);

  final OutreachLeadKind? kind;
  final String? firstName;
  final String? lastName;
  final String? company;
  final String? stateCode;
  final String? city;
  final String? practice;
  final String? phone;
  final String? email;
  final String? note;
  final DateTime? nextActionAt;

  /// Assigned partner (employee); null = unassigned.
  final String? partnerId;

  /// Manual status; registered/paid are set by the system.
  final OutreachLeadStatus? status;

  /// Where the contact came from and on what basis we may write; required for client leads.
  final String? sourceNote;

  /// true = mark do-not-contact (reason manual); false clears it (managers only).
  final bool? doNotContact;

  Map<String, Object?> toJson() => _$OutreachLeadInputDtoToJson(this);
}
