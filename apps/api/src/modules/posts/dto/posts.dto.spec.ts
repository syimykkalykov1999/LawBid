import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreatePostDto, UpdatePostDto } from './posts.dto';

// Owner 2026-10-07: the description is optional; 2026-10-18: the title too.
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

  // Owner 2026-10-18: the title is optional too (a photo / video post);
  // PostsService refuses a post with nothing at all.
  it('accepts an empty title on create and edit', () => {
    expect(errorsOn(CreatePostDto, { title: '', body: '' })).toEqual([]);
    expect(errorsOn(UpdatePostDto, { title: '', body: '' })).toEqual([]);
  });
});
