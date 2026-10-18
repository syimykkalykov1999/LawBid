import 'package:flutter/material.dart';
import 'package:golden_toolkit/golden_toolkit.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/chat/application/voice_player.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/voice_widgets.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-17: voice notes like WhatsApp — sender photo with a mic
/// badge (gold before it is played, blue after), the speed button in its
/// place while playing, a round thumb on the waveform.
class _Playing extends VoicePlayer {
  @override
  VoicePlayback build() => const VoicePlayback(
        messageId: 'playing',
        playing: true,
        position: Duration(seconds: 7),
        speed: 1.5,
      );
}

ChatMessage _note(String id, {required bool listened, String? sender}) =>
    ChatMessage(
      id: id,
      conversationId: 'c',
      kind: MessageKind.voice,
      body: '',
      createdAt: DateTime(2026, 10, 17, 12),
      senderId: sender,
      voice: VoiceNote(
        durationMs: 18000,
        waveform: [
          for (var i = 0; i < kVoiceBars; i++) 15 + (i * 37) % 80,
        ],
        listened: listened,
        localPath: '/tmp/$id.m4a',
      ),
    );

Widget _bubble(BuildContext context, Widget child, {required bool mine}) {
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  return Align(
    alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
    child: Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
      decoration: BoxDecoration(
        color: mine ? colors.accent : colors.surface,
        borderRadius: BorderRadius.circular(18),
        border: mine ? null : Border.all(color: colors.border),
      ),
      child: child,
    ),
  );
}

void main() {
  final themes = {'light': AppTheme.light(), 'dark': AppTheme.dark()};
  for (final entry in themes.entries) {
    testGoldens('voice bubbles like WhatsApp - ${entry.key}', (tester) async {
      await tester.pumpWidgetBuilder(
        Scaffold(
          body: Builder(
            builder: (context) => ListView(
              padding: const EdgeInsets.symmetric(vertical: 16),
              children: [
                _bubble(
                  context,
                  VoiceMessageBody(
                    message: _note('new', listened: false, sender: 'a'),
                    mine: false,
                    threadId: 'c',
                    avatarName: 'Anna Kowalski',
                  ),
                  mine: false,
                ),
                _bubble(
                  context,
                  VoiceMessageBody(
                    message: _note('playing', listened: true, sender: 'a'),
                    mine: false,
                    threadId: 'c',
                    avatarName: 'Anna Kowalski',
                  ),
                  mine: false,
                ),
                _bubble(
                  context,
                  VoiceMessageBody(
                    message: _note('sent', listened: false, sender: 'me'),
                    mine: true,
                    threadId: 'c',
                    avatarName: 'Syimyk Kalykov',
                  ),
                  mine: true,
                ),
                _bubble(
                  context,
                  VoiceMessageBody(
                    message: _note('heard', listened: true, sender: 'me'),
                    mine: true,
                    threadId: 'c',
                    avatarName: 'Syimyk Kalykov',
                  ),
                  mine: true,
                ),
              ],
            ),
          ),
        ),
        wrapper: (child) => uxApp(
          child,
          theme: entry.value,
          overrides: [
            ...uxOverrides(translator: const StaticTranslatorRu()),
            voicePlayerProvider.overrideWith(_Playing.new),
          ],
          size: const Size(390, 460),
          disableAnimations: true,
        ),
        surfaceSize: const Size(390, 460),
      );
      await screenMatchesGolden(tester, 'voice_bubbles_${entry.key}');
    });
  }
}
