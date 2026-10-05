// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'partner_referred_status.dart';
import 'partner_referred_user_dto_role.dart';

part 'partner_referred_user_dto.g.dart';

@JsonSerializable()
class PartnerReferredUserDto {
  const PartnerReferredUserDto({
    required this.id,
    required this.role,
    required this.status,
    required this.amountCents,
    required this.joinedAt,
    this.name,
    this.qualifiedAt,
  });

  factory PartnerReferredUserDto.fromJson(Map<String, Object?> json) =>
      _$PartnerReferredUserDtoFromJson(json);

  final String id;
  final String? name;
  final PartnerReferredUserDtoRole role;
  final PartnerReferredStatus status;

  /// Commission for this person, cents (0 until qualified).
  final int amountCents;
  final DateTime joinedAt;
  final DateTime? qualifiedAt;

  Map<String, Object?> toJson() => _$PartnerReferredUserDtoToJson(this);
}
