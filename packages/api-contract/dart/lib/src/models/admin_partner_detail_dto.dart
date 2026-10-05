// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_partner_commission_row_dto.dart';
import 'admin_partner_referred_user_dto.dart';
import 'admin_partner_row_dto.dart';

part 'admin_partner_detail_dto.g.dart';

@JsonSerializable()
class AdminPartnerDetailDto {
  const AdminPartnerDetailDto({
    required this.partner,
    required this.referred,
    required this.commissions,
  });

  factory AdminPartnerDetailDto.fromJson(Map<String, Object?> json) =>
      _$AdminPartnerDetailDtoFromJson(json);

  final AdminPartnerRowDto partner;
  final List<AdminPartnerReferredUserDto> referred;

  /// Newest first, up to 500.
  final List<AdminPartnerCommissionRowDto> commissions;

  Map<String, Object?> toJson() => _$AdminPartnerDetailDtoToJson(this);
}
