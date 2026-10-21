import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_message_menu.dart';

ChatMessage _m(MessageKind kind, {String id = 'm1', String body = 'hi'}) =>
    ChatMessage(
      id: id,
      conversationId: 'c1',
      kind: kind,
      body: body,
      createdAt: DateTime(2026, 10, 20),
    );

void main() {
  test('text, files, voice and cards can be saved; system lines cannot', () {
    for (final k in [
      MessageKind.text,
      MessageKind.voice,
      MessageKind.attachment,
      MessageKind.contact,
      MessageKind.place,
    ]) {
      expect(MessageMenuTarget.savable(_m(k)), isTrue, reason: '$k');
    }
    for (final k in [
      MessageKind.system,
      MessageKind.call,
      MessageKind.sticker,
    ]) {
      expect(MessageMenuTarget.savable(_m(k)), isFalse, reason: '$k');
    }
  });

  test('an empty text and a message still being sent are not saved', () {
    expect(
      MessageMenuTarget.savable(_m(MessageKind.text, body: '  ')),
      isFalse,
    );
    expect(
      MessageMenuTarget.savable(_m(MessageKind.text, id: 'local:abc')),
      isFalse,
    );
  });

  test('copy gives the text, the address or a photo caption', () {
    expect(MessageMenuTarget.copyText(_m(MessageKind.text)), 'hi');
    expect(
      MessageMenuTarget.copyText(_m(MessageKind.place, body: '1 Main St')),
      '1 Main St',
    );
    expect(MessageMenuTarget.copyText(_m(MessageKind.voice)), isNull);
    expect(MessageMenuTarget.copyText(_m(MessageKind.text, body: ' ')), isNull);
  });
}
