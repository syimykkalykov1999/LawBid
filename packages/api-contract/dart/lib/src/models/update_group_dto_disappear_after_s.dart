// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

/// Disappearing messages: seconds a new message lives; 0 (or null) = off. Allowed for admins, and for everyone while «edit group info» is open to all (WhatsApp).
@JsonEnum()
enum UpdateGroupDtoDisappearAfterS {
  @JsonValue(0)
  value0(0),
  @JsonValue(86400)
  value86400(86400),
  @JsonValue(604800)
  value604800(604800),
  @JsonValue(7776000)
  value7776000(7776000),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const UpdateGroupDtoDisappearAfterS(this.json);

  factory UpdateGroupDtoDisappearAfterS.fromJson(num json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final num? json;
  num toJson() {
    final value = json;
    if (value == null) {
      throw StateError(
        'Cannot convert enum value with null JSON representation to num. '
        'This usually happens for \$unknown or @JsonValue(null) entries.',
      );
    }
    return value as num;
  }

  @override
  String toString() => json?.toString() ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<UpdateGroupDtoDisappearAfterS> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
