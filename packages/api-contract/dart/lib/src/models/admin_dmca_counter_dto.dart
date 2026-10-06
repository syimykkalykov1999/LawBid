// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_dmca_counter_dto.g.dart';

@JsonSerializable()
class AdminDmcaCounterDto {
  const AdminDmcaCounterDto({
    required this.name,
    required this.address,
    required this.email,
    required this.consentJurisdiction,
    required this.sworn,
    required this.signature,
    required this.submittedAt,
    this.phone,
  });

  factory AdminDmcaCounterDto.fromJson(Map<String, Object?> json) =>
      _$AdminDmcaCounterDtoFromJson(json);

  final String name;
  final String address;
  final String? phone;
  final String email;
  final bool consentJurisdiction;
  final bool sworn;
  final String signature;
  final DateTime submittedAt;

  Map<String, Object?> toJson() => _$AdminDmcaCounterDtoToJson(this);
}
