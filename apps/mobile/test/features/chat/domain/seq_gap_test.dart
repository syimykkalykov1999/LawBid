import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';

ChatMessage _m(String id, int? seq) => ChatMessage(
      id: id,
      conversationId: 'c',
      kind: MessageKind.text,
      body: 'x',
      createdAt: DateTime.utc(2026, 11),
      seq: seq,
    );

void main() {
  group('hasSeqGap', () {
    test('the next number is no gap', () {
      expect(hasSeqGap([_m('a', 41), _m('b', 42)], _m('c', 43)), isFalse);
    });

    test('a skipped number is a gap', () {
      expect(hasSeqGap([_m('a', 41), _m('b', 42)], _m('c', 44)), isTrue);
    });

    test('an older or repeated number is no gap', () {
      expect(hasSeqGap([_m('a', 41), _m('b', 42)], _m('c', 42)), isFalse);
      expect(hasSeqGap([_m('a', 41), _m('b', 42)], _m('c', 40)), isFalse);
    });

    test('without numbers nothing is claimed', () {
      expect(hasSeqGap([_m('a', null)], _m('c', 9)), isFalse);
      expect(hasSeqGap([_m('a', 3)], _m('c', null)), isFalse);
      expect(hasSeqGap(const [], _m('c', 9)), isFalse);
    });

    test('a local (unsent) message is ignored', () {
      expect(hasSeqGap([_m('local:1', 99), _m('a', 5)], _m('c', 6)), isFalse);
    });
  });
}
