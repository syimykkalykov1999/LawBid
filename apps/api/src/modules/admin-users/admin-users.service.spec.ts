import { parseUserQuery } from './admin-users.service';

describe('parseUserQuery (docs/06 §2.3 item 3)', () => {
  it('routes each shape to its index', () => {
    expect(parseUserQuery('')).toEqual({ kind: 'none' });
    expect(parseUserQuery('  ')).toEqual({ kind: 'none' });
    expect(parseUserQuery('3F2504E0-4F89-11D3-9A0C-0305E82C3301')).toEqual({
      kind: 'id',
      id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    });
    expect(parseUserQuery('@Jane_Doe')).toEqual({
      kind: 'username',
      usernameLower: 'jane_doe',
    });
    expect(parseUserQuery(' Jane@Example.com ')).toEqual({
      kind: 'email',
      email: 'jane@example.com',
    });
    expect(parseUserQuery('(212) 555-0199')).toEqual({
      kind: 'phone',
      e164: '+12125550199',
    });
    expect(parseUserQuery('1 212 555 0199')).toEqual({
      kind: 'phone',
      e164: '+12125550199',
    });
    expect(parseUserQuery('+44 20 7946 0958')).toEqual({
      kind: 'phone',
      e164: '+442079460958',
    });
    expect(parseUserQuery('Jane Doe')).toEqual({
      kind: 'name',
      needle: 'jane doe',
    });
    // Short digit runs are names/ids of something else, not phones.
    expect(parseUserQuery('12345')).toEqual({ kind: 'name', needle: '12345' });
  });
});
