// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contact_person_dto.dart';
import 'contact_upload_result_dto_status.dart';

part 'contact_upload_result_dto.g.dart';

@JsonSerializable()
class ContactUploadResultDto {
  const ContactUploadResultDto({
    required this.matched,
    required this.people,
    this.status,
    this.bookHash,
    this.bookSize,
    this.matchesVersion,
  });

  factory ContactUploadResultDto.fromJson(Map<String, Object?> json) =>
      _$ContactUploadResultDtoFromJson(json);

  /// Hashes of this upload that belong to LawBid users.
  final int matched;

  /// Old `{hashes}` upload: who of this upload matched. Hash-checked sync (`status: ok`): EVERY person of the stored book on LawBid; the app replaces its list. Empty for not_modified / resync.
  final List<ContactPersonDto> people;

  /// Hash-checked sync only (absent for `{hashes}`). not_modified: the book and the people list are as the app has them, nothing was done. resync: the server does not have the book `baseHash` names: send it whole (`full`).
  final ContactUploadResultDtoStatus? status;

  /// The stored book hash after this request (the next `baseHash`).
  final String? bookHash;
  final int? bookSize;

  /// Version of the people list (send it back as `matchesVersion`).
  final int? matchesVersion;

  Map<String, Object?> toJson() => _$ContactUploadResultDtoToJson(this);
}
