// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'registry_link_dto.dart';
import 'trust_signals_dto.dart';

part 'public_trust_dto.g.dart';

@JsonSerializable()
class PublicTrustDto {
  const PublicTrustDto({
    required this.attorneyId,
    required this.level,
    required this.badge,
    required this.cleared,
    required this.signals,
    required this.acceptsPayments,
    required this.canBid,
    required this.registryLinks,
  });

  factory PublicTrustDto.fromJson(Map<String, Object?> json) =>
      _$PublicTrustDtoFromJson(json);

  final String attorneyId;
  final int level;

  /// The blue check is shown.
  final bool badge;

  /// Every requirement the owner switched on is met (or staff confirmed): the badge and payments are open.
  final bool cleared;
  final TrustSignalsDto signals;

  /// Client money can be sent through LawBid to this attorney.
  final bool acceptsPayments;

  /// Bids and chat are open.
  final bool canBid;

  /// One per licensed state.
  final List<RegistryLinkDto> registryLinks;

  Map<String, Object?> toJson() => _$PublicTrustDtoToJson(this);
}
