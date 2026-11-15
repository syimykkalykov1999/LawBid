import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart'
    show kChatAttachmentMaxBytes;
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_attach.dart';

/// Row 149 review (file_picker 13): «Files» in a chat and in a group refuse
/// a file over the limit, of unknown size or whose size cannot be read
/// before reading any bytes, and one bad file does not stop the others.

final class _Picked extends PlatformFile {
  _Picked(
    this.name, {
    required this.reads,
    this.size,
    this.bytes,
    this.sizeThrows = false,
  });

  @override
  final String name;
  final int? size;
  final Uint8List? bytes;
  final bool sizeThrows;
  final List<String> reads;

  @override
  Uri get uri => Uri.parse('blob:https://lawbid.dev/$name');

  @override
  XFile get xFile => XFile(name);

  @override
  int? lengthSync() {
    if (sizeThrows) throw StateError('no size');
    return size;
  }

  @override
  Future<int?> length() async {
    if (sizeThrows) throw StateError('no size');
    return size;
  }

  @override
  Future<Uint8List> readAsBytes() async {
    reads.add(name);
    return bytes ?? Uint8List(0);
  }

  @override
  Stream<Uint8List> readAsByteStream() async* {
    yield await readAsBytes();
  }
}

final class _Picker extends FilePickerPlatform {
  _Picker(this.files);

  final List<PlatformFile> files;

  @override
  Future<List<PlatformFile>> pickFiles({
    String? dialogTitle,
    String? initialDirectory,
    FileType type = FileType.any,
    List<String>? allowedExtensions,
    // The interface's own signature (untyped return).
    // ignore: inference_failure_on_function_return_type
    Function(FilePickerStatus)? onFileLoading,
    int compressionQuality = 0,
    AndroidOptions androidOptions = const AndroidOptions(),
    DarwinOptions darwinOptions = const DarwinOptions(),
    WindowsOptions windowsOptions = const WindowsOptions(),
    LinuxOptions linuxOptions = const LinuxOptions(),
    WebOptions webOptions = const WebOptions(),
  }) async =>
      files;
}

void main() {
  const t = StaticTranslatorEn();
  final pdf = Uint8List.fromList('%PDF-1.7 small'.codeUnits);
  late List<String> reads;

  List<PlatformFile> picked() => [
        _Picked('huge.pdf', size: kChatAttachmentMaxBytes + 1, reads: reads),
        _Picked('unknown.pdf', reads: reads),
        _Picked('broken.pdf', sizeThrows: true, reads: reads),
        _Picked('ok.pdf', size: pdf.length, bytes: pdf, reads: reads),
      ];

  setUp(() => reads = []);

  Future<BuildContext> pumpContext(WidgetTester tester) async {
    late BuildContext ctx;
    await tester.pumpWidget(
      MaterialApp(
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
    );
    return ctx;
  }

  testWidgets('a group: only the good file is read and sent', (tester) async {
    FilePickerPlatform.instance = _Picker(picked());
    final ctx = await pumpContext(tester);
    final out = await pickGroupFiles(ctx, t, GroupAttachChoice.files);
    await tester.pumpAndSettle();
    expect(reads, ['ok.pdf'], reason: 'nothing over the limit is read');
    expect([for (final f in out) f.name], ['ok.pdf']);
  });

  testWidgets('a chat: only the good file is read and sent', (tester) async {
    FilePickerPlatform.instance = _Picker(picked());
    final ctx = await pumpContext(tester);
    final pending = pickChatFiles(ctx, t);
    await tester.pumpAndSettle();
    await tester.tap(find.text(t.t('chat.attach.files')));
    await tester.pumpAndSettle();
    final out = await pending;
    await tester.pumpAndSettle();
    expect(reads, ['ok.pdf'], reason: 'nothing over the limit is read');
    expect([for (final f in out) f.name], ['ok.pdf']);
  });
}
