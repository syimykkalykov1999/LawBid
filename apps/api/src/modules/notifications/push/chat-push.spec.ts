import {
  chatPushData,
  chatPushKind,
  chatPushPreview,
  chatSenderName,
} from './chat-push';

/** Owner 2026-10-22: message pushes like WhatsApp — who and what. */
describe('chat push text', () => {
  it('names the sender by display name, else @username', () => {
    expect(chatSenderName({ first_name: 'Ann', last_name: 'Lee' })).toBe(
      'Ann Lee',
    );
    expect(
      chatSenderName({
        first_name: null,
        last_name: ' ',
        attorney_profile: { username: 'lawyer_ann' },
      }),
    ).toBe('@lawyer_ann');
    expect(
      chatSenderName({
        first_name: '',
        last_name: null,
        client_profile: { username: 'client1' },
      }),
    ).toBe('@client1');
    expect(chatSenderName({ first_name: null, last_name: null })).toBe('');
    expect(chatSenderName(null)).toBe('');
  });

  it('tells a photo, a video and a file apart by the mime', () => {
    expect(chatPushKind('attachment', 'image/jpeg')).toBe('photo');
    expect(chatPushKind('attachment', 'video/mp4')).toBe('video');
    expect(chatPushKind('attachment', 'application/pdf')).toBe('file');
    expect(chatPushKind('attachment', null)).toBe('file');
    expect(chatPushKind('voice')).toBe('voice');
    expect(chatPushKind('text')).toBe('text');
    expect(chatPushKind('poll')).toBe('poll');
  });

  it('says what was sent, in the reader language', () => {
    expect(chatPushPreview('photo', '', true)).toBe('📷 Фото');
    expect(chatPushPreview('photo', 'look', true)).toBe('📷 look');
    expect(chatPushPreview('video', '', true)).toBe('🎥 Видео');
    expect(chatPushPreview('video', '', false)).toBe('🎥 Video');
    expect(chatPushPreview('file', '', true)).toBe('📎 Файл');
    expect(chatPushPreview('voice', '', true, 12_000)).toBe(
      '🎤 Голосовое сообщение 0:12',
    );
    expect(chatPushPreview('voice', '', false)).toBe('🎤 Voice message');
    expect(chatPushPreview('text', 'hello', true)).toBe('hello');
  });

  it('carries the sender, photo and chat for the app (strings only)', () => {
    const data = chatPushData({
      senderId: 'u2',
      senderName: 'Ann Lee',
      senderAvatar: 'https://cdn/a.jpg',
      senderAvatarKey: 'f1',
      text: 'hi',
      kind: 'text',
      sentAt: new Date(1000),
      group: { title: 'Team', avatar: null, avatarKey: null },
    });
    expect(data).toEqual({
      style: 'chat',
      senderId: 'u2',
      senderName: 'Ann Lee',
      senderAvatar: 'https://cdn/a.jpg',
      senderAvatarKey: 'f1',
      text: 'hi',
      kind: 'text',
      sentAt: '1000',
      isGroup: '1',
      chatTitle: 'Team',
    });
    for (const v of Object.values(data)) expect(typeof v).toBe('string');
  });
});
