// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sign_request_dto_created_by_role.dart';
import 'sign_request_dto_declined_by_role.dart';
import 'sign_request_dto_status.dart';
import 'sign_view_dto.dart';
import 'signature_dto.dart';

part 'sign_request_dto.g.dart';

@JsonSerializable()
class SignRequestDto {
  const SignRequestDto({
    required this.id,
    required this.title,
    required this.status,
    required this.createdByRole,
    required this.createdAt,
    required this.completedAt,
    required this.sourceUrl,
    required this.finalUrl,
    required this.sourceSha256,
    required this.finalSha256,
    required this.signatures,
    required this.canSign,
    required this.canDecline,
    required this.canCancel,
    required this.declinedByRole,
    required this.declineReason,
    required this.expiresAt,
    required this.expired,
    required this.remindersSent,
    required this.lastRemindedAt,
    required this.views,
    required this.canResend,
  });

  factory SignRequestDto.fromJson(Map<String, Object?> json) =>
      _$SignRequestDtoFromJson(json);

  final String id;
  final String title;
  final SignRequestDtoStatus status;
  final SignRequestDtoCreatedByRole createdByRole;
  final DateTime createdAt;
  final DateTime? completedAt;

  /// The original PDF.
  final String? sourceUrl;

  /// The signed PDF, once both signed.
  final String? finalUrl;
  final String sourceSha256;
  final String? finalSha256;
  final List<SignatureDto> signatures;
  final bool canSign;
  final bool canDecline;
  final bool canCancel;
  final SignRequestDtoDeclinedByRole? declinedByRole;
  final String? declineReason;
  final DateTime? expiresAt;

  /// The request ran out of time (its status is then `canceled`); the sender can resend.
  final bool expired;
  final num remindersSent;
  final DateTime? lastRemindedAt;

  /// Audit: when each side opened the waiting document.
  final List<SignViewDto> views;

  /// The sender may remind the other side now.
  final bool canResend;

  Map<String, Object?> toJson() => _$SignRequestDtoToJson(this);
}
