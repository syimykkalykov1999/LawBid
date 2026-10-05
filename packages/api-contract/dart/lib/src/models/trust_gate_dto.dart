// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'trust_gate_dto_reason.dart';

part 'trust_gate_dto.g.dart';

@JsonSerializable()
class TrustGateDto {
  const TrustGateDto({
    required this.ok,
    required this.reason,
    required this.requiredValue,
    required this.current,
    required this.hold,
  });

  factory TrustGateDto.fromJson(Map<String, Object?> json) =>
      _$TrustGateDtoFromJson(json);

  final bool ok;
  final TrustGateDtoReason? reason;

  /// Level the gate needs.
  /// The name has been replaced because it contains a keyword. Original name: `required`.
  @JsonKey(name: 'required')
  final int requiredValue;
  final int current;

  /// Hold code when paused.
  final String? hold;

  Map<String, Object?> toJson() => _$TrustGateDtoToJson(this);
}
