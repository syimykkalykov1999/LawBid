// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'upload_contact_hashes_dto.g.dart';

@JsonSerializable()
class UploadContactHashesDto {
  const UploadContactHashesDto({
    this.hashes,
    this.full,
    this.added,
    this.removed,
    this.baseHash,
    this.bookHash,
    this.matchesVersion,
  });
  
  factory UploadContactHashesDto.fromJson(Map<String, Object?> json) => _$UploadContactHashesDtoFromJson(json);
  
  /// Old builds: lowercase hex SHA-256 of each normalized E.164 number ("+14155552680"). Never raw numbers.
  final List<String>? hashes;

  /// The whole book: `added` replaces every stored hash (first sync, or after `resync`).
  final bool? full;

  /// Hashes added since `baseHash` (or the whole book with `full`).
  final List<String>? added;

  /// Hashes removed from the book since `baseHash`.
  final List<String>? removed;

  /// The book hash the app believes the server has (from the last answer). Required with `added` / `removed` unless `full`.
  final String? baseHash;

  /// XOR of every hash of the app’s book now (after this request). Alone: the "not modified" check.
  final String? bookHash;

  /// The `matchesVersion` of the people list the app has; a newer one on the server sends the list again.
  final int? matchesVersion;

  Map<String, Object?> toJson() => _$UploadContactHashesDtoToJson(this);
}
