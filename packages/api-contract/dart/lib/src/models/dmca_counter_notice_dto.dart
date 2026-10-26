// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'dmca_counter_notice_dto.g.dart';

@JsonSerializable()
class DmcaCounterNoticeDto {
  const DmcaCounterNoticeDto({
    required this.name,
    required this.address,
    required this.email,
    required this.consentJurisdiction,
    required this.sworn,
    required this.signature,
    this.phone,
  });

  factory DmcaCounterNoticeDto.fromJson(Map<String, Object?> json) =>
      _$DmcaCounterNoticeDtoFromJson(json);

  final String name;
  final String address;
  final String? phone;
  final String email;

  /// Consent to the jurisdiction of the federal district court for the address (must be true).
  final bool consentJurisdiction;

  /// Sworn under penalty of perjury that the removal was a mistake or misidentification (must be true).
  final bool sworn;
  final String signature;

  Map<String, Object?> toJson() => _$DmcaCounterNoticeDtoToJson(this);
}
