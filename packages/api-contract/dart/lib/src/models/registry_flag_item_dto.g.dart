// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'registry_flag_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RegistryFlagItemDto _$RegistryFlagItemDtoFromJson(Map<String, dynamic> json) =>
    RegistryFlagItemDto(
      attorney: AdminAttorneySummaryDto.fromJson(
        json['attorney'] as Map<String, dynamic>,
      ),
      license: AdminLicenseDto.fromJson(
        json['license'] as Map<String, dynamic>,
      ),
      latestRequestId: json['latestRequestId'] as String?,
    );

Map<String, dynamic> _$RegistryFlagItemDtoToJson(
  RegistryFlagItemDto instance,
) => <String, dynamic>{
  'attorney': instance.attorney.toJson(),
  'license': instance.license.toJson(),
  'latestRequestId': ?instance.latestRequestId,
};
