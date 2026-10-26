import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCaseTaskDto, TaskDoneDto } from './workspace.dto';

// Owner 2026-10-13: the done mark must pass the app's whitelist (a body
// property with no validator is rejected as "should not exist").
describe('workspace DTOs', () => {
  it('TaskDoneDto accepts a boolean done and nothing else', async () => {
    const ok = plainToInstance(TaskDoneDto, { done: true });
    expect(
      await validate(ok, { whitelist: true, forbidNonWhitelisted: true }),
    ).toHaveLength(0);
    const text = plainToInstance(TaskDoneDto, { done: 'yes' });
    expect(await validate(text)).not.toHaveLength(0);
  });

  it('a task takes a due date and a reminder up to two weeks', async () => {
    const base = { kind: 'for_client', title: 'Documents' };
    const good = plainToInstance(CreateCaseTaskDto, {
      ...base,
      dueAt: '2026-11-05T15:00:00Z',
      remindBeforeMin: 1440,
    });
    expect(
      await validate(good, { forbidNonWhitelisted: true, whitelist: true }),
    ).toHaveLength(0);
    const far = plainToInstance(CreateCaseTaskDto, {
      ...base,
      remindBeforeMin: 99999,
    });
    expect(await validate(far)).not.toHaveLength(0);
  });
});
