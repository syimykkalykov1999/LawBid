import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/files/pick_files.dart' show pickedFileReadable;
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart'
    show kChatAttachmentMaxBytes;
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_attach.dart';
import 'package:material_ui/material_ui.dart';

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

  // Row 149 review: a big photo from «Files» is still sent, shrunk (as
  // WhatsApp / Telegram); a 2 GB "picture" is never read whole.
  group('a photo over the file limit', () {
    const limits = PlaceUploadLimits(
      maxPhotos: 10,
      maxFiles: 10,
      fileMb: 25,
      totalMb: 100,
      formats: {'jpeg', 'pdf'},
    );
    late Uint8List jpeg;

    setUpAll(() {
      final image = img.Image(width: 3000, height: 2000);
      for (final p in image) {
        p
          ..r = (p.x * 7) % 256
          ..g = (p.y * 3) % 256
          ..b = 90;
      }
      jpeg = img.encodeJpg(image, quality: 95);
    });

    setUp(ClientTuning.reset);

    List<PlatformFile> bigPhotos() => [
          // Reported as 30 MB: over the 25 MB limit, under 4x it.
          _Picked('big.jpg', size: 30 << 20, bytes: jpeg, reads: reads),
          // Reported as 2 GB: over 4x the limit.
          _Picked('huge.jpg', size: 2 << 30, bytes: jpeg, reads: reads),
          // A document over the limit is never read.
          _Picked('big.pdf', size: 30 << 20, bytes: pdf, reads: reads),
        ];

    void expectShrunk(List<PickedChatFile> out) {
      expect(reads, ['big.jpg'], reason: 'the 2 GB one and the PDF unread');
      final photo = out.single;
      expect(photo.name, 'big.jpg');
      final decoded = img.decodeJpg(photo.bytes)!;
      expect(decoded.width, ClientTuning.chatPhotoMaxPx.round());
      expect(photo.bytes.length, lessThan(limits.fileBytes));
    }

    testWidgets('a group: the 30 MB photo is shrunk and sent', (tester) async {
      FilePickerPlatform.instance = _Picker(bigPhotos());
      final ctx = await pumpContext(tester);
      final out = await tester.runAsync(
        () => pickGroupFiles(ctx, t, GroupAttachChoice.files, limits: limits),
      );
      expectShrunk(out!);
    });

    test("the cap is the admin's: 0 = no cap", () {
      expect(pickedFileReadable(30 << 20, 25 << 20, image: true), isTrue);
      expect(pickedFileReadable(2 << 30, 25 << 20, image: true), isFalse);
      expect(pickedFileReadable(30 << 20, 25 << 20, image: false), isFalse);
      ClientTuning.apply(const {'media.picked_image_read_x': '0'});
      expect(pickedFileReadable(2 << 30, 25 << 20, image: true), isTrue);
    });
  });

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
