// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_user_subscription_dto.dart';

part 'admin_attorney_card_dto.g.dart';

@JsonSerializable()
class AdminAttorneyCardDto {
  const AdminAttorneyCardDto({
    required this.username,
    required this.firmName,
    required this.verificationStatus,
    required this.verifiedAt,
    required this.ratingAvg,
    required this.ratingCount,
    required this.followersCount,
    required this.postsCount,
    required this.licenses,
    required this.subscription,
  });

  factory AdminAttorneyCardDto.fromJson(Map<String, Object?> json) =>
      _$AdminAttorneyCardDtoFromJson(json);

  final String username;
  final String? firmName;
  final String verificationStatus;
  final DateTime? verifiedAt;
  final num ratingAvg;
  final int ratingCount;
  final int followersCount;
  final int postsCount;

  /// `NY:verified`, …
  final List<String> licenses;
  final AdminUserSubscriptionDto? subscription;

  Map<String, Object?> toJson() => _$AdminAttorneyCardDtoToJson(this);
}
