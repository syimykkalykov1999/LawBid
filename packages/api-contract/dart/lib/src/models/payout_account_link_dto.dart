// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'payout_account_link_dto.g.dart';

@JsonSerializable()
class PayoutAccountLinkDto {
  const PayoutAccountLinkDto({required this.url});

  factory PayoutAccountLinkDto.fromJson(Map<String, Object?> json) =>
      _$PayoutAccountLinkDtoFromJson(json);

  /// Short-lived Stripe URL to open in a browser.
  final String url;

  Map<String, Object?> toJson() => _$PayoutAccountLinkDtoToJson(this);
}
