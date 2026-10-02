// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'client_badge_checkout_dto.g.dart';

@JsonSerializable()
class ClientBadgeCheckoutDto {
  const ClientBadgeCheckoutDto({required this.checkoutUrl});

  factory ClientBadgeCheckoutDto.fromJson(Map<String, Object?> json) =>
      _$ClientBadgeCheckoutDtoFromJson(json);

  /// Stripe checkout page; open it in the browser.
  final String checkoutUrl;

  Map<String, Object?> toJson() => _$ClientBadgeCheckoutDtoToJson(this);
}
