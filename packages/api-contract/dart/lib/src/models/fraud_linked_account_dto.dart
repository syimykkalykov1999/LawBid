// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fingerprint_kind.dart';
import 'fraud_user_dto.dart';

part 'fraud_linked_account_dto.g.dart';

@JsonSerializable()
class FraudLinkedAccountDto {
  const FraudLinkedAccountDto({
    required this.user,
    required this.kinds,
    required this.blocked,
  });

  factory FraudLinkedAccountDto.fromJson(Map<String, Object?> json) =>
      _$FraudLinkedAccountDtoFromJson(json);

  final FraudUserDto user;

  /// What the two accounts share (never the values).
  final List<FingerprintKind> kinds;

  /// That account is blocked.
  final bool blocked;

  Map<String, Object?> toJson() => _$FraudLinkedAccountDtoToJson(this);
}
