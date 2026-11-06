import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart' show MediaDeviceInfo;
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/calls/application/call_audio_route.dart';
import 'package:lawbid/features/calls/presentation/call_controls.dart';

import '../../helpers/ux_harness.dart';
import 'call_audio_fakes.dart';

MediaDeviceInfo _d(String kind, String id, {String label = '', String? g}) =>
    MediaDeviceInfo(kind: kind, deviceId: id, label: label, groupId: g);

Future<void> _settle() => Future<void>.delayed(const Duration(milliseconds: 5));

void main() {
  group('the outputs a platform lists', () {
    test('Android: AudioSwitch kinds, a headset by its name', () {
      final out = androidOutputs([
        _d('audioinput', 'mic'),
        _d('audiooutput', 'earpiece', label: 'Earpiece'),
        _d('audiooutput', 'speaker', label: 'Speakerphone'),
        _d('audiooutput', 'bluetooth', label: 'Galaxy Buds'),
      ]);
      expect(out.map((o) => o.kind), [
        CallAudioKind.phone,
        CallAudioKind.speaker,
        CallAudioKind.bluetooth,
      ]);
      expect(out.last.label, 'Galaxy Buds');
      expect(out.first.label, isEmpty);
      expect(bestHeadset(out)?.id, 'bluetooth');
    });

    test('iPhone: a Bluetooth headset from its microphone port', () {
      final out = iosOutputs([
        _d(
          'audioinput',
          'mic-1',
          label: 'iPhone Microphone',
          g: 'MicrophoneBuiltIn',
        ),
        _d('audioinput', 'bt-1', label: 'AirPods', g: 'BluetoothHFP'),
        _d('audiooutput', 'Speaker', label: 'Speaker', g: 'Speaker'),
        _d('audiooutput', 'bt-1', label: 'AirPods', g: 'BluetoothHFP'),
      ]);
      expect(out.map((o) => o.kind), [
        CallAudioKind.phone,
        CallAudioKind.speaker,
        CallAudioKind.bluetooth,
      ]);
      expect(out.first.inputId, 'mic-1');
      expect(out.last.inputId, 'bt-1');
      expect(out.last.label, 'AirPods');
    });

    test('iPhone: wired headphones leave no earpiece route', () {
      final out = iosOutputs([
        _d('audioinput', 'mic-1', g: 'MicrophoneBuiltIn'),
        _d('audiooutput', 'wired-1', label: 'Headphones', g: 'Headphones'),
      ]);
      expect(out.map((o) => o.kind), [
        CallAudioKind.speaker,
        CallAudioKind.wired,
      ]);
    });

    test('web: the browser names, no «communications» twin, no unnamed', () {
      final out = webOutputs([
        _d('audiooutput', 'default', label: 'Default - MacBook Speakers'),
        _d('audiooutput', 'communications', label: 'Communications - X'),
        _d('audiooutput', 'abc', label: 'AirPods Pro'),
        _d('audiooutput', 'zzz'),
      ]);
      expect(out.map((o) => o.id), ['default', 'abc']);
      expect(out.last.kind, CallAudioKind.bluetooth);
    });
  });

  group('the router', () {
    late FakeCallAudioDevices devices;
    late ProviderContainer container;

    CallAudioRouter router() =>
        container.read(callAudioRouterProvider.notifier);
    CallAudioState state() => container.read(callAudioRouterProvider);

    setUp(() {
      devices = FakeCallAudioDevices();
      container = ProviderContainer(
        overrides: [callAudioDevicesProvider.overrideWithValue(devices)],
      );
      addTearDown(container.dispose);
    });

    test('no headset: nothing forced, the earpiece / speaker as asked',
        () async {
      await router().start(video: false);
      expect(devices.used, isEmpty);
      expect(state().current?.kind, CallAudioKind.phone);
      expect(state().choice, isFalse);
      router().noteSpeaker(on: true);
      expect(state().current?.kind, CallAudioKind.speaker);
    });

    test('a video call without a headset starts on the speaker', () async {
      await router().start(video: true);
      expect(state().current?.kind, CallAudioKind.speaker);
    });

    test('Bluetooth wins over wired; a second headset joins the list',
        () async {
      devices.list = [
        FakeCallAudioDevices.phoneOut,
        FakeCallAudioDevices.speakerOut,
        FakeCallAudioDevices.wiredOut,
        FakeCallAudioDevices.btOut,
      ];
      await router().start(video: false);
      expect(devices.used, [FakeCallAudioDevices.btOut]);
      expect(state().inHeadset, isTrue);
    });

    test('the chosen speaker stays when the list changes otherwise', () async {
      devices.list = [
        FakeCallAudioDevices.phoneOut,
        FakeCallAudioDevices.speakerOut,
        FakeCallAudioDevices.btOut,
      ];
      await router().start(video: false);
      await router().select(FakeCallAudioDevices.speakerOut);
      devices.disconnect(FakeCallAudioDevices.phoneOut);
      await _settle();
      expect(state().current, FakeCallAudioDevices.speakerOut);
      expect(devices.autos, isEmpty);
    });

    test('a headset taken off while another is there: that one', () async {
      devices.list = [
        FakeCallAudioDevices.phoneOut,
        FakeCallAudioDevices.speakerOut,
        FakeCallAudioDevices.wiredOut,
        FakeCallAudioDevices.btOut,
      ];
      await router().start(video: false);
      devices.disconnect(FakeCallAudioDevices.btOut);
      await _settle();
      expect(devices.autos, [false]);
      expect(state().current, FakeCallAudioDevices.wiredOut);
    });

    test('after stop nothing moves', () async {
      await router().start(video: false);
      router().stop();
      devices.connect(FakeCallAudioDevices.btOut);
      await _settle();
      expect(devices.used, isEmpty);
      expect(state().current, isNull);
    });

    test('web: more than one output = a list; a gone output = default',
        () async {
      devices = FakeCallAudioDevices(
        web: true,
        outputs: const [
          CallAudioOutput(id: 'default', kind: CallAudioKind.speaker),
          CallAudioOutput(id: 'usb', kind: CallAudioKind.wired, label: 'USB'),
        ],
      );
      container = ProviderContainer(
        overrides: [callAudioDevicesProvider.overrideWithValue(devices)],
      );
      addTearDown(container.dispose);
      await router().start(video: false);
      // A browser does not jump to a headset itself: the default follows
      // the system.
      expect(devices.used, isEmpty);
      expect(state().choice, isTrue);
      const usb =
          CallAudioOutput(id: 'usb', kind: CallAudioKind.wired, label: 'USB');
      await router().select(usb);
      devices.disconnect(usb);
      await _settle();
      expect(devices.autos, hasLength(1));
      expect(state().current?.id, 'default');
    });
  });

  testWidgets('the speaker button shows a Bluetooth headset', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(),
        child: MaterialApp(
          theme: AppTheme.of(AppThemeId.values.first),
          home: Scaffold(
            body: CallControlBar(
              speaker: false,
              videoOn: false,
              muted: false,
              audioRoute: CallAudioKind.bluetooth,
              onSpeaker: () {},
              onVideo: () {},
              onMute: () {},
              onEnd: () {},
            ),
          ),
        ),
      ),
    );
    final icon = tester.widget<CallRoundButton>(
      find.byKey(const Key('call-btn-speaker')),
    );
    expect(icon.icon, AppIcons.bluetoothAudio);
  });
}
