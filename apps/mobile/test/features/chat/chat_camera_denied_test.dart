import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_attach.dart';
import 'package:material_ui/material_ui.dart';

/// ROUND1 25.11 row 17 (WhatsApp / Telegram): the camera of a 1:1 chat and of
/// a group when the phone refuses the camera. image_picker throws
/// `PlatformException(camera_access_denied)`; the tap did nothing and the
/// error went nowhere. Now no file comes, and the reason shows with the way
/// to the phone's settings.
const _channel = MethodChannel('plugins.flutter.io/image_picker');

void main() {
  const t = StaticTranslatorEn();

  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_channel, (call) async {
      throw PlatformException(
        code: 'camera_access_denied',
        message: 'The user did not allow camera access.',
      );
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_channel, null);
  });

  Future<BuildContext> pumpContext(WidgetTester tester) async {
    late BuildContext ctx;
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: Builder(
              builder: (c) {
                ctx = c;
                return const SizedBox();
              },
            ),
          ),
        ),
      ),
    );
    return ctx;
  }

  testWidgets('1:1 chat: a refused camera explains itself', (tester) async {
    final ctx = await pumpContext(tester);
    final out = await pickChatFiles(ctx, t, directChoice: 'camera');
    await tester.pump();
    expect(out, isEmpty);
    expect(find.text(t.t('verification.camera.denied.body')), findsOneWidget);
    expect(find.text(t.t('settings.title')), findsOneWidget);
  });

  testWidgets('group chat: a refused camera explains itself', (tester) async {
    final ctx = await pumpContext(tester);
    final out = await pickGroupFiles(ctx, t, GroupAttachChoice.camera);
    await tester.pump();
    expect(out, isEmpty);
    expect(find.text(t.t('verification.camera.denied.body')), findsOneWidget);
    expect(find.text(t.t('settings.title')), findsOneWidget);
  });
}
