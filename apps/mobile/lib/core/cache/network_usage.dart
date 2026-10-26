import 'package:flutter/foundation.dart';

/// Owner 2026-10-22 (plan §5.2, Telegram «Сетевой трафик»): what the app
/// asked the network for — requests, bytes received, 304 «still the same»
/// answers and answers served from the phone without a request. Shown on
/// «Данные и память» to see that the economy packages took effect.
@immutable
class NetworkUsage {
  const NetworkUsage({
    this.requests = 0,
    this.bytesReceived = 0,
    this.notModified = 0,
    this.servedLocally = 0,
  });

  factory NetworkUsage.fromJson(Map<String, dynamic> json) => NetworkUsage(
        requests: (json['requests'] as num?)?.toInt() ?? 0,
        bytesReceived: (json['bytes'] as num?)?.toInt() ?? 0,
        notModified: (json['notModified'] as num?)?.toInt() ?? 0,
        servedLocally: (json['local'] as num?)?.toInt() ?? 0,
      );

  final int requests;
  final int bytesReceived;
  final int notModified;
  final int servedLocally;

  NetworkUsage operator +(NetworkUsage o) => NetworkUsage(
        requests: requests + o.requests,
        bytesReceived: bytesReceived + o.bytesReceived,
        notModified: notModified + o.notModified,
        servedLocally: servedLocally + o.servedLocally,
      );

  Map<String, int> toJson() => {
        'requests': requests,
        'bytes': bytesReceived,
        'notModified': notModified,
        'local': servedLocally,
      };
}

/// Counts this process's traffic; a listener persists the day's total.
class NetworkUsageCounter extends ValueNotifier<NetworkUsage> {
  NetworkUsageCounter() : super(const NetworkUsage());

  void request({required int bytes}) =>
      value = value + NetworkUsage(requests: 1, bytesReceived: bytes);

  void notModified() =>
      value = value + const NetworkUsage(requests: 1, notModified: 1);

  void servedLocally() => value = value + const NetworkUsage(servedLocally: 1);

  void reset() => value = const NetworkUsage();
}
