import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreatePostDto, UpdatePostDto } from './posts.dto';

// Owner 2026-10-07: a post needs a title; the description is optional.
describe('post description is optional', () => {
  const errorsOn = (
    cls: typeof CreatePostDto | typeof UpdatePostDto,
    v: object,
  ) => validateSync(plainToInstance(cls, v)).map((e) => e.property);

  it('accepts an empty description on create and edit', () => {
    expect(errorsOn(CreatePostDto, { title: 'Visa tips', body: '' })).toEqual(
      [],
    );
    expect(
      errorsOn(CreatePostDto, { title: 'Visa tips', body: '   ' }),
    ).toEqual([]);
    expect(errorsOn(UpdatePostDto, { body: '' })).toEqual([]);
  });

  it('still requires the title', () => {
    expect(errorsOn(CreatePostDto, { title: '', body: '' })).toContain('title');
  });
});
