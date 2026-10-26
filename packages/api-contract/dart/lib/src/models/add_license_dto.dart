// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'add_license_dto.g.dart';

@JsonSerializable()
class AddLicenseDto {
  const AddLicenseDto({
    required this.stateCode,
    required this.barNumber,
    this.expiresAt,
    this.renewal,
    this.manualReview,
  });

  factory AddLicenseDto.fromJson(Map<String, Object?> json) =>
      _$AddLicenseDtoFromJson(json);

  /// US state code
  final String stateCode;
  final String barNumber;

  /// License expiry (YYYY-MM-DD), if the license has one.
  final String? expiresAt;

  /// True to renew a license that is still verified (a new expiry date). Without it a state that is already verified is refused.
  final bool? renewal;

  /// Owner 2026-10-18 («Мой номер верный — отправить на проверку»): the attorney insists the number is right although it does not fit the state's format. It is added for a person to check (registry flag format_unusual) and the bar card photo becomes required; allowed while the attempts lock is on.
  final bool? manualReview;

  Map<String, Object?> toJson() => _$AddLicenseDtoToJson(this);
}
