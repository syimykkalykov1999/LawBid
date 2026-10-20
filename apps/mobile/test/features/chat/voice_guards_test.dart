import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/navigation/shell/main_shell.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/chat/application/voice_player.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart';

class _Call extends CallController {
  _Call(this.phase);

  final CallPhase phase;

  @override
  CallSession build() => CallSession(phase: phase);
}

void main() {
  test('a recorded note waits per chat and survives leaving the chat', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final drafts = c.read(voiceDraftsProvider.notifier);
    const a = (path: '/tmp/a.m4a', durationMs: 4000, waveform: <int>[10, 40]);
    const b = (path: '/tmp/b.m4a', durationMs: 1500, waveform: <int>[5]);
    drafts
      ..put('chat-a', a)
      ..put('chat-b', b);
    // The provider outlives the chat screen (not autoDispose).
    expect(c.read(voiceDraftsProvider.notifier).of('chat-a'), a);
    expect(c.read(voiceDraftsProvider.notifier).of('chat-b'), b);
    drafts.clear('chat-a');
    expect(c.read(voiceDraftsProvider.notifier).of('chat-a'), isNull);
    expect(c.read(voiceDraftsProvider.notifier).of('chat-b'), b);
    drafts.clear('missing');
    expect(c.read(voiceDraftsProvider).keys, ['chat-b']);
  });

  test('notes and recording are blocked while a call is on', () {
    for (final phase in CallPhase.values) {
      final c = ProviderContainer(
        overrides: [
          callControllerProvider.overrideWith(() => _Call(phase)),
        ],
      );
      addTearDown(c.dispose);
      expect(
        c.read(voicePlayerProvider.notifier).callBusy,
        phase != CallPhase.idle,
        reason: '$phase',
      );
    }
  });

  testWidgets('a strip above the screens takes the status bar once', (t) async {
    EdgeInsets? padding;
    EdgeInsets? viewPadding;
    Widget app({required bool taken}) => MediaQuery(
          data: const MediaQueryData(
            padding: EdgeInsets.only(top: 36, bottom: 20),
            viewPadding: EdgeInsets.only(top: 36, bottom: 20),
          ),
          child: StatusBarTaken(
            taken: taken,
            child: Builder(
              builder: (context) {
                padding = MediaQuery.paddingOf(context);
                viewPadding = MediaQuery.viewPaddingOf(context);
                return const SizedBox();
              },
            ),
          ),
        );
    await t.pumpWidget(app(taken: false));
    expect(padding!.top, 36);
    await t.pumpWidget(app(taken: true));
    expect(padding!.top, 0);
    expect(viewPadding!.top, 0);
    // Only the top: the bottom inset stays for the nav bar.
    expect(padding!.bottom, 20);
    expect(viewPadding!.bottom, 20);
  });
}
