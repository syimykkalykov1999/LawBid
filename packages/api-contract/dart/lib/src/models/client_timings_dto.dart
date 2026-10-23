// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'client_timings_dto.g.dart';

@JsonSerializable()
class ClientTimingsDto {
  const ClientTimingsDto({required this.timings});

  factory ClientTimingsDto.fromJson(Map<String, Object?> json) =>
      _$ClientTimingsDtoFromJson(json);

  /// Live-connection timings the app must use (set in the admin, Config → realtime.*): reconnectMinMs, reconnectMaxMs, reconnectJitter (0–1), serverDisconnectMinWaitMs, serverDisconnectMaxWaitMs, offlineFailures, offlineSeconds, probeTimeoutMs, tokenRefreshLeadSeconds, pollingFallbackIntervalSeconds, reconnectedDebounceSeconds, refetchJitterMs, pingIntervalMs, pingTimeoutMs. See docs/runbooks/REALTIME_LIFECYCLE.md.
  final Map<String, num> timings;

  Map<String, Object?> toJson() => _$ClientTimingsDtoToJson(this);
}
