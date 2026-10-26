// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'trust_release_dto.g.dart';

@JsonSerializable()
class TrustReleaseDto {
  const TrustReleaseDto({this.note, this.payments, this.bids});

  factory TrustReleaseDto.fromJson(Map<String, Object?> json) =>
      _$TrustReleaseDtoFromJson(json);

  final String? note;

  /// Resume payments (default true).
  final bool? payments;

  /// Resume bids (default true).
  final bool? bids;

  Map<String, Object?> toJson() => _$TrustReleaseDtoToJson(this);
}
