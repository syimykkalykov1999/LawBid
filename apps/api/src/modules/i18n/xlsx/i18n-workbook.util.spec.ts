import {
  buildParsedWorkbook,
  buildTranslationsWorkbookBuffer,
  parseCsv,
  parseTranslationsFile,
} from './i18n-workbook.util';

describe('parseCsv', () => {
  it('splits plain comma-separated rows', () => {
    const rows = parseCsv('key,en,ru\nfoo.bar,Hello,Привет\n');
    expect(rows).toEqual([
      ['key', 'en', 'ru'],
      ['foo.bar', 'Hello', 'Привет'],
    ]);
  });

  it('handles quoted fields containing commas and embedded newlines', () => {
    const rows = parseCsv(
      'key,en\n' + 'greeting,"Hello, ""friend""\nwelcome"\n',
    );
    expect(rows).toEqual([
      ['key', 'en'],
      ['greeting', 'Hello, "friend"\nwelcome'],
    ]);
  });

  it('strips a UTF-8 BOM if present', () => {
    const rows = parseCsv('﻿key,en\nfoo,Bar\n');
    expect(rows[0]).toEqual(['key', 'en']);
  });

  it('skips a trailing blank line', () => {
    const rows = parseCsv('key,en\nfoo,Bar\n\n');
    expect(rows).toHaveLength(2);
  });
});

describe('buildParsedWorkbook — §9.3 validation rules', () => {
  it('parses a valid grid with no errors', () => {
    const grid = [
      ['key', 'en', 'ru'],
      ['common.cancel', 'Cancel', 'Отмена'],
      [
        'auth.otp.subtitle',
        'We sent it to {phone}',
        'Мы отправили его на {phone}',
      ],
    ];
    const { workbook, errors } = buildParsedWorkbook(grid);
    expect(errors).toEqual([]);
    expect(workbook.languageCodes).toEqual(['en', 'ru']);
    expect(workbook.rows).toEqual([
      { key: 'common.cancel', values: { en: 'Cancel', ru: 'Отмена' } },
      {
        key: 'auth.otp.subtitle',
        values: {
          en: 'We sent it to {phone}',
          ru: 'Мы отправили его на {phone}',
        },
      },
    ]);
  });

  it('rejects a first column that is not "key"', () => {
    const { errors } = buildParsedWorkbook([
      ['id', 'en'],
      ['a', 'b'],
    ]);
    expect(errors.some((e) => e.message.includes('First column'))).toBe(true);
  });

  it('requires an "en" column', () => {
    const { errors } = buildParsedWorkbook([
      ['key', 'ru'],
      ['a', 'б'],
    ]);
    expect(errors.some((e) => e.message.includes('"en" is a required'))).toBe(
      true,
    );
  });

  it('rejects an unknown (non ISO-639-1) language column', () => {
    const { errors } = buildParsedWorkbook([
      ['key', 'en', 'not-a-lang'],
      ['a', 'Hello', 'x'],
    ]);
    expect(
      errors.some((e) => e.message.includes('Unknown language column')),
    ).toBe(true);
  });

  it('rejects duplicate keys within the file', () => {
    const { errors } = buildParsedWorkbook([
      ['key', 'en'],
      ['a', 'One'],
      ['a', 'Two'],
    ]);
    expect(errors.some((e) => e.message.includes('Duplicate key'))).toBe(true);
  });

  it('rejects an empty "en" value for a key', () => {
    const { errors } = buildParsedWorkbook([
      ['key', 'en', 'ru'],
      ['a', '', 'Привет'],
    ]);
    expect(errors.some((e) => e.lang === 'en' && e.key === 'a')).toBe(true);
  });

  it('rejects a placeholder mismatch between en and another language', () => {
    const { errors } = buildParsedWorkbook([
      ['key', 'en', 'ru'],
      ['a', 'Hi {name}', 'Привет'],
    ]);
    expect(
      errors.some(
        (e) =>
          e.key === 'a' &&
          e.lang === 'ru' &&
          e.message.includes('Placeholder mismatch'),
      ),
    ).toBe(true);
  });

  it('accepts matching placeholders regardless of order', () => {
    const { errors } = buildParsedWorkbook([
      ['key', 'en', 'ru'],
      ['a', '{count} of {total}', '{total} из {count}'],
    ]);
    expect(errors).toEqual([]);
  });

  it('skips fully blank rows without error', () => {
    const { workbook, errors } = buildParsedWorkbook([
      ['key', 'en'],
      ['', ''],
      ['a', 'Hello'],
    ]);
    expect(errors).toEqual([]);
    expect(workbook.rows).toHaveLength(1);
  });
});

describe('parseTranslationsFile', () => {
  it('sniffs a CSV buffer (no xlsx magic bytes) and parses it as CSV', async () => {
    const grid = await parseTranslationsFile(
      Buffer.from('key,en\nfoo,Bar\n', 'utf-8'),
    );
    expect(grid).toEqual([
      ['key', 'en'],
      ['foo', 'Bar'],
    ]);
  });

  it('round-trips a real .xlsx buffer built by buildTranslationsWorkbookBuffer', async () => {
    const xlsxBuffer = await buildTranslationsWorkbookBuffer(
      ['en', 'ru'],
      [
        { key: 'a', values: { en: 'Hello', ru: 'Привет' } },
        { key: 'b', values: { en: 'Bye' } },
      ],
    );
    const grid = await parseTranslationsFile(xlsxBuffer);
    const { workbook, errors } = buildParsedWorkbook(grid);
    expect(errors).toEqual([]);
    expect(workbook.languageCodes).toEqual(['en', 'ru']);
    expect(workbook.rows).toEqual([
      { key: 'a', values: { en: 'Hello', ru: 'Привет' } },
      { key: 'b', values: { en: 'Bye' } },
    ]);
  });
});
