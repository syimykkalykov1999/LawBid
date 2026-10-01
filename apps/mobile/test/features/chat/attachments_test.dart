import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart';

/// OQ-047: chat attachments — accepted formats, names, sizes.
void main() {
  test('every common photo and office format maps to its MIME', () {
    expect(chatMimeForName('Contract.PDF'), 'application/pdf');
    expect(chatMimeForName('a.docx'),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(chatMimeForName('a.xls'), 'application/vnd.ms-excel');
    expect(chatMimeForName('a.xlsx'),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(chatMimeForName('slides.pptx'),
        'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    expect(chatMimeForName('IMG_1.HEIC'), 'image/heic');
    expect(chatMimeForName('notes.txt'), 'text/plain');
    expect(chatMimeForName('table.csv'), 'text/csv');
    expect(chatMimeForName('virus.exe'), isNull);
    expect(chatMimeForName('noext'), isNull);
    for (final ext in kChatFileExtensions) {
      expect(chatMimeForName('x.$ext'), isNotNull, reason: ext);
    }
  });

  test('extension and size labels', () {
    const a = ChatAttachment(
        fileId: 'f', name: 'Lease v2.final.DOCX', isImage: false);
    expect(a.extension, 'docx');
    expect(
        const ChatAttachment(fileId: 'f', name: 'README', isImage: false)
            .extension,
        '');
    expect(fileSizeLabel(830 * 1024), '830 KB');
    expect(fileSizeLabel(13 * 1024 * 1024), '13.0 MB');
    expect(fileSizeLabel(null), '');
  });
}
