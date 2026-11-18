import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_attach.dart';
import 'package:material_ui/material_ui.dart';

/// Groups WhatsApp parity: the gallery of a group chat picks videos too,
/// as the 1:1 chat's (pickChatFiles): each video goes through
/// `prepareVideo` (the phone's one encode) and is sent as `video/mp4`;
/// without `prepareVideo` (or with no video format allowed) the gallery
/// stays photos only.
const _channel = MethodChannel('plugins.flutter.io/image_picker');

void main() {
  const t = StaticTranslatorEn();
  late Directory dir;
  final calls = <String>[];

  setUp(() {
    dir = Directory.systemTemp.createTempSync('grx-video');
    calls.clear();
    final clip = File('${dir.path}/clip.mp4')
      ..writeAsBytesSync(List.filled(64, 1));
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_channel, (call) async {
      calls.add(call.method);
      return <String>[clip.path];
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_channel, null);
    dir.deleteSync(recursive: true);
  });

  Future<BuildContext> pumpContext(WidgetTester tester) async {
    late BuildContext ctx;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Builder(
          builder: (c) {
            ctx = c;
            return const SizedBox();
          },
        ),
      ),
    );
    return ctx;
  }

  testWidgets('a video from the gallery is prepared and sent as mp4',
      (tester) async {
    final ctx = await pumpContext(tester);
    final prepared = <String>[];
    final out = await tester.runAsync(
      () => pickGroupFiles(
        ctx,
        t,
        GroupAttachChoice.photos,
        prepareVideo: (v) async {
          prepared.add(v.name);
          final ready = File('${dir.path}/video.mp4')
            ..writeAsBytesSync(List.filled(32, 2));
          return XFile(ready.path, name: 'video.mp4', mimeType: 'video/mp4');
        },
      ),
    );
    expect(calls, ['pickMedia']);
    expect(prepared, ['clip.mp4']);
    expect(out!.single.name, 'video.mp4');
    expect(out.single.mime, 'video/mp4');
    expect(out.single.bytes.length, 32);
  });

  testWidgets('without prepareVideo the gallery is photos only',
      (tester) async {
    final ctx = await pumpContext(tester);
    await tester.runAsync(
      () => pickGroupFiles(ctx, t, GroupAttachChoice.photos),
    );
    expect(calls, ['pickMultiImage']);
  });

  testWidgets('the menu says «Gallery» when videos are offered',
      (tester) async {
    final ctx = await pumpContext(tester);
    unawaitedMenu(ctx, t, video: true);
    await tester.pumpAndSettle();
    expect(find.text(t.t('chat.attach.gallery')), findsOneWidget);
    expect(find.text(t.t('chat.attach.photos')), findsNothing);
  });
}

void unawaitedMenu(
  BuildContext ctx,
  StaticTranslatorEn t, {
  bool video = false,
}) {
  showGroupAttachMenu(ctx, t, video: video).ignore();
}
