import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/voice_widgets.dart';
import 'package:lawbid/features/profile/application/avatar_upload_controller.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';

/// Owner 26.11 (WhatsApp): my voice notes show my photo just picked at
/// once — the same picture as my profile header — while it still goes up.
final _jpeg = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4]);

class _Picked extends AvatarUploadController {
  @override
  AvatarUploadState build() => AvatarUploadState(
        stage: AvatarUploadStage.checking,
        progress: 1,
        preview: _jpeg,
      );
}

ChatMessage _note({required bool mine}) => ChatMessage(
      id: mine ? 'm' : 't',
      conversationId: 'c',
      kind: MessageKind.voice,
      body: '',
      createdAt: DateTime(2026, 11, 26, 12),
      senderId: mine ? 'me' : 'a',
      voice: VoiceNote(
        durationMs: 4000,
        waveform: [for (var i = 0; i < kVoiceBars; i++) 20],
        listened: false,
        localPath: '/tmp/note.m4a',
      ),
    );

void main() {
  Future<void> pump(WidgetTester tester, {required bool mine}) =>
      tester.pumpWidget(
        uxApp(
          Scaffold(
            body: VoiceMessageBody(
              message: _note(mine: mine),
              mine: mine,
              threadId: 'c',
              avatarUrl: 'https://cdn.test/old.jpg',
              avatarName: 'Anna Kowalski',
            ),
          ),
          theme: AppTheme.light(),
          overrides: [
            ...uxOverrides(),
            avatarUploadControllerProvider.overrideWith(_Picked.new),
          ],
          disableAnimations: true,
        ),
      );

  bool picked(WidgetTester tester) =>
      tester.widget<AppAvatar>(find.byType(AppAvatar)).imageProvider
          is MemoryImage;

  testWidgets('my voice note shows my photo just picked', (tester) async {
    await pump(tester, mine: true);
    expect(picked(tester), isTrue);
  });

  testWidgets("the other person's note keeps their photo", (tester) async {
    await pump(tester, mine: false);
    expect(picked(tester), isFalse);
  });
}
