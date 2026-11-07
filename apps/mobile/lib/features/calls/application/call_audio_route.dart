import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

/// Owner 2026-11-04 («звонки не идут в наушники»; «как в вацапе»): where a
/// call's sound goes — the phone's earpiece, the loudspeaker, wired
/// headphones or a Bluetooth headset. Like WhatsApp and the phone's own
/// dialer: a headset that is connected takes the call by itself (at the
/// start and when it is connected mid-call); when it goes, the sound falls
/// back to the earpiece (a voice call) or the loudspeaker (a video call);
/// with a headset connected the speaker button opens the list of outputs.
///
/// Everything platform-bound is flutter_webrtc's own API (no channel of
/// ours): `Helper.enumerateDevices`, `Helper.setSpeakerphoneOn`,
/// `Helper.selectAudioOutput` (Android: twilio AudioSwitch device kinds),
/// `Helper.selectAudioInput` (iPhone: the headset's microphone port takes
/// the route with it), `navigator.mediaDevices.ondevicechange`, and on the
/// web `RTCVideoRenderer.audioOutput` (= `setSinkId`). The order of calls
/// follows LiveKit's Flutter SDK (Apache-2.0, `Hardware` +
/// `AudioManager.setSpeakerOutputPreferred`: the loudspeaker is only
/// «preferred», a headset still wins unless the person chose the speaker
/// themselves).
enum CallAudioKind { phone, speaker, wired, bluetooth }

@immutable
class CallAudioOutput {
  const CallAudioOutput({
    required this.id,
    required this.kind,
    this.label = '',
    this.inputId,
  });

  /// Android: AudioSwitch's kind name (`earpiece`, `speaker`,
  /// `wired-headset`, `bluetooth`); iPhone: the port UID (`Speaker` for the
  /// loudspeaker); web: the `audiooutput` device id.
  final String id;
  final CallAudioKind kind;

  /// The device's own name (a Bluetooth headset's, the browser's label);
  /// empty = the screen names it by its kind.
  final String label;

  /// iPhone: the microphone port of this output (a headset's mic, or the
  /// built-in one for the earpiece) — choosing it moves the route there.
  final String? inputId;

  bool get headset =>
      kind == CallAudioKind.wired || kind == CallAudioKind.bluetooth;

  @override
  bool operator ==(Object other) =>
      other is CallAudioOutput && other.id == id && other.kind == kind;

  @override
  int get hashCode => Object.hash(id, kind);

  @override
  String toString() => 'CallAudioOutput($kind, $id, $label)';
}

@immutable
class CallAudioState {
  const CallAudioState({
    this.outputs = const [],
    this.current,
    this.web = false,
  });

  final List<CallAudioOutput> outputs;

  /// Where the sound goes now (null before a call).
  final CallAudioOutput? current;
  final bool web;

  bool get hasHeadset => outputs.any((o) => o.headset);

  /// The speaker button opens the list instead of switching the speaker:
  /// a headset is connected (phones), or there is more than one output
  /// (a browser).
  bool get choice => web ? outputs.length > 1 : hasHeadset;

  /// The sound is in a headset now (the button shows it; the proximity
  /// sensor stays off — the phone is not at the ear).
  bool get inHeadset => current?.headset ?? false;
}

/// The best headset of [outputs]: Bluetooth before wired (AudioSwitch's own
/// preferred order), null without one.
CallAudioOutput? bestHeadset(Iterable<CallAudioOutput> outputs) =>
    outputs.where((o) => o.kind == CallAudioKind.bluetooth).firstOrNull ??
    outputs.where((o) => o.kind == CallAudioKind.wired).firstOrNull;

/// Android: AudioSwitch lists every output it can route to.
List<CallAudioOutput> androidOutputs(Iterable<MediaDeviceInfo> devices) {
  final out = <CallAudioOutput>[];
  for (final d in devices.where((d) => d.kind == 'audiooutput')) {
    final kind = switch (d.deviceId) {
      'earpiece' => CallAudioKind.phone,
      'speaker' => CallAudioKind.speaker,
      'wired-headset' => CallAudioKind.wired,
      'bluetooth' => CallAudioKind.bluetooth,
      _ => null,
    };
    if (kind == null || out.any((o) => o.kind == kind)) continue;
    out.add(
      CallAudioOutput(
        id: d.deviceId,
        kind: kind,
        label: kind == CallAudioKind.bluetooth ? d.label : '',
      ),
    );
  }
  return out;
}

/// iPhone: flutter_webrtc lists the session's available INPUTS (a headset
/// with a microphone, the built-in mic) and only the CURRENT route's
/// outputs; the choice is built from both (port types are the groupIds).
/// With wired headphones in, iOS has no earpiece route, so «Phone» is left
/// out then (the system picker does the same).
List<CallAudioOutput> iosOutputs(Iterable<MediaDeviceInfo> devices) {
  const btPorts = {
    'BluetoothHFP',
    'BluetoothA2DPOutput',
    'BluetoothLE',
    'CarAudio',
  };
  const wiredPorts = {'Headphones', 'HeadsetMic', 'USBAudio'};
  CallAudioOutput? phone;
  final heads = <CallAudioOutput>[];
  void addHead(CallAudioOutput o) {
    if (heads.any((h) => h.label.isNotEmpty && h.label == o.label)) return;
    if (heads.any((h) => h.id == o.id)) return;
    heads.add(o);
  }

  for (final d in devices.where((d) => d.kind == 'audioinput')) {
    final type = d.groupId ?? '';
    if (type == 'MicrophoneBuiltIn') {
      phone ??= CallAudioOutput(
        id: 'Receiver',
        kind: CallAudioKind.phone,
        inputId: d.deviceId,
      );
    } else if (btPorts.contains(type)) {
      addHead(
        CallAudioOutput(
          id: d.deviceId,
          kind: CallAudioKind.bluetooth,
          label: d.label,
          inputId: d.deviceId,
        ),
      );
    } else if (wiredPorts.contains(type)) {
      addHead(
        CallAudioOutput(
          id: d.deviceId,
          kind: CallAudioKind.wired,
          label: d.label,
          inputId: d.deviceId,
        ),
      );
    }
  }
  for (final d in devices.where((d) => d.kind == 'audiooutput')) {
    final type = d.groupId ?? '';
    if (btPorts.contains(type)) {
      addHead(
        CallAudioOutput(
          id: d.deviceId,
          kind: CallAudioKind.bluetooth,
          label: d.label,
        ),
      );
    } else if (wiredPorts.contains(type)) {
      addHead(
        CallAudioOutput(
          id: d.deviceId,
          kind: CallAudioKind.wired,
          label: d.label,
        ),
      );
    }
  }
  final wired = heads.any((h) => h.kind == CallAudioKind.wired);
  return [
    if (phone != null && !wired) phone,
    const CallAudioOutput(id: 'Speaker', kind: CallAudioKind.speaker),
    ...heads,
  ];
}

/// A browser: its `audiooutput` devices as they are (Chrome's «Default»
/// first, its «Communications» twin left out); unnamed ones (no
/// permission yet) are not listed.
List<CallAudioOutput> webOutputs(Iterable<MediaDeviceInfo> devices) {
  final out = <CallAudioOutput>[];
  for (final d in devices.where((d) => d.kind == 'audiooutput')) {
    if (d.deviceId == 'communications' || d.label.isEmpty) continue;
    if (out.any((o) => o.id == d.deviceId)) continue;
    final l = d.label.toLowerCase();
    final kind = l.contains('bluetooth') || l.contains('airpods')
        ? CallAudioKind.bluetooth
        : l.contains('headphone') || l.contains('headset')
            ? CallAudioKind.wired
            : CallAudioKind.speaker;
    out.add(CallAudioOutput(id: d.deviceId, kind: kind, label: d.label));
  }
  return out;
}

/// The platform side of [CallAudioRouter] (a fake in tests).
abstract interface class CallAudioDevices {
  bool get web;

  /// Something was connected or disconnected, or the route changed.
  Stream<void> get changes;

  Future<List<CallAudioOutput>> outputs();

  /// The person chose [output] (or a headset was just connected): the
  /// sound goes there, even past a connected headset.
  Future<void> use(CallAudioOutput output);

  /// A headset when there is one, else the loudspeaker ([speaker]) or the
  /// phone's earpiece.
  Future<void> auto({required bool speaker});
}

/// The one `ondevicechange` slot of flutter_webrtc, shared (LiveKit's
/// `Hardware.onDeviceChange`): the router and the web microphone both
/// listen.
abstract final class CallDeviceChanges {
  static StreamController<void>? _changes;

  static Stream<void> get stream {
    final c = _changes ??= StreamController<void>.broadcast(
      onListen: () => navigator.mediaDevices.ondevicechange = (_) {
        _changes?.add(null);
      },
      onCancel: () => navigator.mediaDevices.ondevicechange = null,
    );
    return c.stream;
  }
}

/// Web: the `<audio>` elements a call plays through, so a chosen output
/// reaches every one of them (and the ones that come later).
abstract final class CallWebAudioSinks {
  static final _renderers = <RTCVideoRenderer>{};
  static String? _sink;

  static void attach(RTCVideoRenderer r) {
    _renderers.add(r);
    final sink = _sink;
    if (sink != null) unawaited(_apply(r, sink));
  }

  static void detach(RTCVideoRenderer r) => _renderers.remove(r);

  static Future<void> select(String deviceId) async {
    _sink = deviceId;
    for (final r in _renderers.toList()) {
      await _apply(r, deviceId);
    }
  }

  static void reset() => _sink = null;

  static Future<void> _apply(RTCVideoRenderer r, String id) async {
    try {
      await r.audioOutput(id);
    } on Object {
      // The browser cannot choose outputs (no setSinkId).
    }
  }
}

/// Phones: the loudspeaker on/off, a connected headset first. flutter_
/// webrtc's `setSpeakerphoneOn(false)` already prefers a headset (Android:
/// Bluetooth → wired → earpiece; iPhone: no override, iOS routes to the
/// headset); `setSpeakerphoneOn(true)` forces the loudspeaker past it — so
/// «speaker on» asks for it only when no headset is there (LiveKit's
/// «preferred, not forced»). `setSpeakerphoneOnButPreferBluetooth` is not
/// used: on iOS it activates the audio session itself, which a CallKit
/// call (answered on the lock screen) must leave to CallKit.
// ignore: avoid_positional_boolean_parameters
Future<void> setCallSpeakerPreferHeadset(bool on) async {
  if (kIsWeb) return;
  var headset = false;
  if (on) {
    try {
      final list = await _nativeOutputs();
      headset = list.any((o) => o.headset);
    } on Object {
      // Unknown: the speaker as asked.
    }
  }
  await Helper.setSpeakerphoneOn(on && !headset);
}

/// iPhone, before a call's microphone opens: the call's audio session may
/// use a Bluetooth headset (HFP and A2DP) and AirPlay — flutter_webrtc's
/// `setAppleAudioConfiguration` (LiveKit's `localAndRemote` configuration,
/// voice-chat mode). It also becomes WebRTC's own configuration, so a
/// session WebRTC sets up again later (CallKit's activation, an
/// interruption) keeps the headset. The app's launch category (.playback,
/// AppDelegate) had no options at all. Not activated here — CallKit
/// activates the session for a call answered on the lock screen.
Future<void> prepareCallAudioSession() async {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.iOS) return;
  try {
    await Helper.setAppleAudioConfiguration(
      AppleAudioConfiguration(
        appleAudioCategory: AppleAudioCategory.playAndRecord,
        appleAudioCategoryOptions: const {
          AppleAudioCategoryOption.allowBluetooth,
          AppleAudioCategoryOption.allowBluetoothA2DP,
          AppleAudioCategoryOption.allowAirPlay,
        },
        appleAudioMode: AppleAudioMode.voiceChat,
      ),
    );
  } on Object {
    // The session keeps what it had.
  }
}

Future<List<CallAudioOutput>> _nativeOutputs() async {
  final ios = defaultTargetPlatform == TargetPlatform.iOS;
  final devices = await navigator.mediaDevices.enumerateDevices();
  return ios ? iosOutputs(devices) : androidOutputs(devices);
}

class WebRtcCallAudioDevices implements CallAudioDevices {
  const WebRtcCallAudioDevices();

  bool get _ios => defaultTargetPlatform == TargetPlatform.iOS;

  @override
  bool get web => kIsWeb;

  @override
  Stream<void> get changes => CallDeviceChanges.stream;

  @override
  Future<List<CallAudioOutput>> outputs() async {
    if (!kIsWeb) return _nativeOutputs();
    return webOutputs(await navigator.mediaDevices.enumerateDevices());
  }

  @override
  Future<void> use(CallAudioOutput output) async {
    if (kIsWeb) return CallWebAudioSinks.select(output.id);
    if (_ios) {
      if (output.kind == CallAudioKind.speaker) {
        await Helper.setSpeakerphoneOn(true);
        return;
      }
      await Helper.setSpeakerphoneOn(false);
      final input = output.inputId;
      if (input != null) await Helper.selectAudioInput(input);
      return;
    }
    // Android: AudioSwitch selects the device by its kind and keeps it
    // until it goes away.
    await Helper.selectAudioOutput(output.id);
  }

  @override
  Future<void> auto({required bool speaker}) async {
    if (kIsWeb) return CallWebAudioSinks.select('');
    await setCallSpeakerPreferHeadset(speaker);
  }
}

/// No device work at all — `flutter test` has no WebRTC plugin (its event
/// channel would report a MissingPluginException into every call test).
class NoCallAudioDevices implements CallAudioDevices {
  const NoCallAudioDevices();

  @override
  bool get web => false;

  @override
  Stream<void> get changes => const Stream.empty();

  @override
  Future<List<CallAudioOutput>> outputs() async => const [];

  @override
  Future<void> use(CallAudioOutput output) async {}

  @override
  Future<void> auto({required bool speaker}) async {}
}

bool get _flutterTest =>
    !kIsWeb && Platform.environment.containsKey('FLUTTER_TEST');

final callAudioDevicesProvider = Provider<CallAudioDevices>(
  (ref) => _flutterTest
      ? const NoCallAudioDevices()
      : const WebRtcCallAudioDevices(),
);

/// The call's audio route; started when a call's media is up, stopped
/// when the call ends.
class CallAudioRouter extends Notifier<CallAudioState> {
  StreamSubscription<void>? _sub;
  bool _live = false;
  bool _video = false;

  CallAudioDevices get _devices => ref.read(callAudioDevicesProvider);

  @override
  CallAudioState build() {
    ref.onDispose(() => unawaited(_sub?.cancel()));
    return const CallAudioState();
  }

  /// A call's media is open: a connected headset takes the sound (the
  /// media already asked for the earpiece / the loudspeaker).
  Future<void> start({required bool video}) async {
    _live = true;
    _video = video;
    final devices = _devices;
    _sub ??= devices.changes.listen((_) => unawaited(_onChange()));
    final list = await _list();
    if (!_live) return;
    final head = devices.web ? null : bestHeadset(list);
    if (head != null) await _use(head);
    if (!_live) return;
    state = CallAudioState(
      outputs: list,
      web: devices.web,
      current: head ?? _plain(list, speaker: video),
    );
  }

  void stop() {
    _live = false;
    unawaited(_sub?.cancel());
    _sub = null;
    if (_devices.web) CallWebAudioSinks.reset();
    state = const CallAudioState();
  }

  /// The call turned into a video call or back: where the sound goes when
  /// a headset is taken off.
  // ignore: use_setters_to_change_properties
  void setVideo({required bool video}) => _video = video;

  /// The speaker button switched the loudspeaker (no headset connected).
  void noteSpeaker({required bool on}) {
    if (!_live || state.web) return;
    state = CallAudioState(
      outputs: state.outputs,
      current: _plain(state.outputs, speaker: on),
    );
  }

  /// The person chose an output in the list.
  Future<void> select(CallAudioOutput output) async {
    if (!_live) return;
    await _use(output);
    state = CallAudioState(
      outputs: state.outputs,
      web: state.web,
      current: output,
    );
  }

  Future<void> _onChange() async {
    if (!_live) return;
    final before = state.outputs;
    final list = await _list();
    if (!_live) return;
    var current = state.current;
    final web = state.web;
    final added = list
        .where((o) => o.headset && !before.any((b) => b.id == o.id))
        .toList();
    final fresh = web ? null : bestHeadset(added);
    if (fresh != null) {
      // Connected mid-call: the sound goes there (WhatsApp, the dialer).
      await _use(fresh);
      current = fresh;
    } else if (current != null && !list.any((o) => o.id == current!.id)) {
      if (web) {
        // The chosen output is gone: the browser's default again.
        await _auto();
        current = list.firstOrNull;
      } else if (current.headset) {
        // Taken off: earpiece (voice) or loudspeaker (video), or the other
        // headset that is still there.
        await _auto();
        current = bestHeadset(list) ?? _plain(list, speaker: _video);
      } else {
        current = _plain(list, speaker: current.kind == CallAudioKind.speaker);
      }
    } else if (current != null) {
      final id = current.id;
      current = list.where((o) => o.id == id).firstOrNull ?? current;
    }
    if (!_live) return;
    state = CallAudioState(outputs: list, web: web, current: current);
  }

  CallAudioOutput _plain(List<CallAudioOutput> list, {required bool speaker}) {
    final kind = speaker ? CallAudioKind.speaker : CallAudioKind.phone;
    if (state.web || _devices.web) {
      return list.firstOrNull ??
          const CallAudioOutput(id: 'default', kind: CallAudioKind.speaker);
    }
    return list.where((o) => o.kind == kind).firstOrNull ??
        CallAudioOutput(id: speaker ? 'speaker' : 'earpiece', kind: kind);
  }

  Future<List<CallAudioOutput>> _list() async {
    try {
      return await _devices.outputs();
    } on Object {
      return state.outputs;
    }
  }

  Future<void> _use(CallAudioOutput o) async {
    try {
      await _devices.use(o);
    } on Object {
      // The route stays as the system set it.
    }
  }

  Future<void> _auto() async {
    try {
      await _devices.auto(speaker: _video);
    } on Object {
      // The system picks.
    }
  }
}

final callAudioRouterProvider =
    NotifierProvider<CallAudioRouter, CallAudioState>(CallAudioRouter.new);
