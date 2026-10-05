// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_partner_referred_user_dto_role.dart';
import 'partner_referred_status.dart';

part 'admin_partner_referred_user_dto.g.dart';

@JsonSerializable()
class AdminPartnerReferredUserDto {
  const AdminPartnerReferredUserDto({
    required this.id,
    required this.role,
    required this.status,
    required this.amountCents,
    required this.joinedAt,
    required this.referralId,
    required this.referralStatus,
    this.name,
    this.qualifiedAt,
    this.email,
  });

  factory AdminPartnerReferredUserDto.fromJson(Map<String, Object?> json) =>
      _$AdminPartnerReferredUserDtoFromJson(json);

  final String id;
  final String? name;
  final AdminPartnerReferredUserDtoRole role;
  final PartnerReferredStatus status;

  /// Commission for this person, cents (0 until qualified).
  final int amountCents;
  final DateTime joinedAt;
  final DateTime? qualifiedAt;
  final String? email;
  final String referralId;

  /// Referral row status (pending/qualified/rewarded/rejected).
  final String referralStatus;

  Map<String, Object?> toJson() => _$AdminPartnerReferredUserDtoToJson(this);
}
