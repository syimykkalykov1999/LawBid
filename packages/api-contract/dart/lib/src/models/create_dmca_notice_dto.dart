// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'dmca_target_type.dart';

part 'create_dmca_notice_dto.g.dart';

@JsonSerializable()
class CreateDmcaNoticeDto {
  const CreateDmcaNoticeDto({
    required this.complainantName,
    required this.complainantEmail,
    required this.complainantAddress,
    required this.workDescription,
    required this.goodFaith,
    required this.accuracySworn,
    required this.signature,
    this.targetType,
    this.targetId,
    this.infringingUrl,
    this.complainantPhone,
  });

  factory CreateDmcaNoticeDto.fromJson(Map<String, Object?> json) =>
      _$CreateDmcaNoticeDtoFromJson(json);

  final DmcaTargetType? targetType;
  final String? targetId;

  /// Where the infringing material is, when no target is given.
  final String? infringingUrl;
  final String complainantName;
  final String complainantEmail;

  /// Postal address.
  final String complainantAddress;
  final String? complainantPhone;

  /// The copyrighted work and how it is infringed.
  final String workDescription;

  /// Good-faith belief that the use is not authorized by the owner, its agent or the law (must be true).
  final bool goodFaith;

  /// The information is accurate and, under penalty of perjury, the complainant is the owner or authorized to act (must be true).
  final bool accuracySworn;

  /// Full name.
  final String signature;

  Map<String, Object?> toJson() => _$CreateDmcaNoticeDtoToJson(this);
}
