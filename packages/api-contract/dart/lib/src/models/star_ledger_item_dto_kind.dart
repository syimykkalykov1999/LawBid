// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum StarLedgerItemDtoKind {
  @JsonValue('topup')
  topup('topup'),
  @JsonValue('gift_sent')
  giftSent('gift_sent'),
  @JsonValue('gift_converted')
  giftConverted('gift_converted'),
  @JsonValue('sticker_pack')
  stickerPack('sticker_pack'),
  @JsonValue('boost')
  boost('boost'),
  @JsonValue('boost_refund')
  boostRefund('boost_refund'),
  @JsonValue('reaction')
  reaction('reaction'),
  @JsonValue('admin_grant')
  adminGrant('admin_grant'),
  @JsonValue('refund')
  refund('refund'),
  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const StarLedgerItemDtoKind(this.json);

  factory StarLedgerItemDtoKind.fromJson(String json) => values.firstWhere(
        (e) => e.json == json,
        orElse: () => $unknown,
      );

  final String? json;
  String toJson() {
    final value = json;
    if (value == null) {
      throw StateError('Cannot convert enum value with null JSON representation to String. '
          'This usually happens for \$unknown or @JsonValue(null) entries.');
    }
    return value as String;
  }

  @override
  String toString() => json?.toString() ?? super.toString();
  /// Returns all defined enum values excluding the $unknown value.
  static List<StarLedgerItemDtoKind> get $valuesDefined => values.where((value) => value != $unknown).toList();
}
