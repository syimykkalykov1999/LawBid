import 'dart:async';

import 'package:lawbid/features/calls/application/call_audio_route.dart';

/// The phone's audio outputs, by hand: [connect] / [disconnect] fire the
/// device-change event like flutter_webrtc's `ondevicechange`.
class FakeCallAudioDevices implements CallAudioDevices {
  FakeCallAudioDevices({List<CallAudioOutput>? outputs, this.web = false})
      : list = outputs ?? [phoneOut, speakerOut];

  static const phoneOut =
      CallAudioOutput(id: 'earpiece', kind: CallAudioKind.phone);
  static const speakerOut =
      CallAudioOutput(id: 'speaker', kind: CallAudioKind.speaker);
  static const wiredOut =
      CallAudioOutput(id: 'wired-headset', kind: CallAudioKind.wired);
  static const btOut = CallAudioOutput(
    id: 'bluetooth',
    kind: CallAudioKind.bluetooth,
    label: 'AirPods',
  );

  @override
  final bool web;
  List<CallAudioOutput> list;
  final used = <CallAudioOutput>[];
  final autos = <bool>[];
  final _changes = StreamController<void>.broadcast();

  @override
  Stream<void> get changes => _changes.stream;

  void connect(CallAudioOutput o) {
    list = [...list, o];
    _changes.add(null);
  }

  void disconnect(CallAudioOutput o) {
    list = list.where((x) => x != o).toList();
    _changes.add(null);
  }

  @override
  Future<List<CallAudioOutput>> outputs() async => List.of(list);

  @override
  Future<void> use(CallAudioOutput output) async => used.add(output);

  @override
  Future<void> auto({required bool speaker}) async => autos.add(speaker);
}
