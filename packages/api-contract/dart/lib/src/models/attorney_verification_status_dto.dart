// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'verification_status.dart';

part 'attorney_verification_status_dto.g.dart';

@JsonSerializable()
class AttorneyVerificationStatusDto {
  const AttorneyVerificationStatusDto({
    required this.attorneyId,
    required this.verificationStatus,
    required this.withdrawnBids,
  });

  factory AttorneyVerificationStatusDto.fromJson(Map<String, Object?> json) =>
      _$AttorneyVerificationStatusDtoFromJson(json);

  final String attorneyId;
  final VerificationStatus verificationStatus;

  /// Active bids moved to withdrawn (suspend).
  final int withdrawnBids;

  Map<String, Object?> toJson() => _$AttorneyVerificationStatusDtoToJson(this);
}
