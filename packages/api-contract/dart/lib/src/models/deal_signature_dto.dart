// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'party_role.dart';

part 'deal_signature_dto.g.dart';

@JsonSerializable()
class DealSignatureDto {
  const DealSignatureDto({
    required this.role,
    required this.name,
    required this.signedAt,
  });

  factory DealSignatureDto.fromJson(Map<String, Object?> json) =>
      _$DealSignatureDtoFromJson(json);

  final PartyRole role;
  final String name;
  final DateTime signedAt;

  Map<String, Object?> toJson() => _$DealSignatureDtoToJson(this);
}
