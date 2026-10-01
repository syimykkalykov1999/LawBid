import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AssistantSelf,
  AttorneyOnly,
} from '../auth/assistant/assistant-context';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import {
  ActivityDto,
  ActivityQueryDto,
  AddAssistantDto,
  AssistantIdParamDto,
  AssistantMeDto,
  AssistantPhoneDto,
  AssistantRequestDto,
  CreateAssistantRequestDto,
  CreateTaskDto,
  DecideRequestDto,
  JoinVerifyDto,
  RequestsQueryDto,
  TaskDto,
  TasksQueryDto,
  TaskStepInputDto,
  TaskStepParamDto,
  UpdateTaskStepDto,
  TeamDto,
  UpdateAssistantDto,
  UpdateTaskStatusDto,
} from './assistants.dto';
import { AssistantsService } from './assistants.service';
import { TasksService } from './tasks.service';

const E = ErrorCode;

/** Owner 2026-09-30 (OQ-048): attorney assistants, approvals and tasks. */
@ApiTags('assistants')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class AssistantsController {
  constructor(
    private readonly assistants: AssistantsService,
    private readonly tasks: TasksService,
  ) {}

  // --- the assistant themself (no attorney swap) -------------------------

  @AssistantSelf()
  @Get('assistants/me')
  @ApiOperation({ summary: "The assistant's own team state" })
  @ApiEnvelopeResponse(AssistantMeDto)
  getAssistantMe(@CurrentUser() user: RequestUser): Promise<AssistantMeDto> {
    return this.assistants.me(user);
  }

  @AssistantSelf()
  @Post('assistants/join/accept')
  @ApiOperation({ summary: 'Join the attorney who added this phone' })
  @ApiEnvelopeResponse(AssistantMeDto)
  @ApiErrors({
    404: [E.ASSISTANT_INVITE_NOT_FOUND],
    409: [E.ASSISTANT_NO_FREE_SEAT],
  })
  acceptAssistantInvite(
    @CurrentUser() user: RequestUser,
  ): Promise<AssistantMeDto> {
    return this.assistants.acceptInvite(user);
  }

  @AssistantSelf()
  @Post('assistants/join/request-code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Send a join code to the attorney's phone" })
  @ApiErrors({
    404: [E.NOT_FOUND],
    409: [E.ASSISTANT_NO_FREE_SEAT],
    429: [E.RATE_LIMITED],
  })
  requestAssistantCode(
    @CurrentUser() user: RequestUser,
    @Body() dto: AssistantPhoneDto,
  ): Promise<void> {
    return this.assistants.requestCode(user, dto.phone);
  }

  @AssistantSelf()
  @Post('assistants/join/verify')
  @ApiOperation({ summary: 'Join with the code the attorney received' })
  @ApiEnvelopeResponse(AssistantMeDto)
  @ApiErrors({
    400: [E.AUTH_OTP_INVALID, E.AUTH_OTP_EXPIRED, E.AUTH_OTP_LOCKED],
    409: [E.ASSISTANT_NO_FREE_SEAT],
  })
  verifyAssistantCode(
    @CurrentUser() user: RequestUser,
    @Body() dto: JoinVerifyDto,
  ): Promise<AssistantMeDto> {
    return this.assistants.verifyCode(user, dto.attorneyPhone, dto.code);
  }

  // --- the attorney's team ------------------------------------------------

  @AttorneyOnly()
  @Get('team')
  @ApiOperation({ summary: 'Assistants, seats and duties' })
  @ApiEnvelopeResponse(TeamDto)
  getTeam(@CurrentUser() user: RequestUser): Promise<TeamDto> {
    return this.assistants.team(user);
  }

  @AttorneyOnly()
  @Post('team')
  @ApiOperation({ summary: 'Add an assistant by phone (joins without a code)' })
  @ApiEnvelopeResponse(TeamDto)
  @ApiErrors({
    400: [E.ASSISTANT_LIABILITY_REQUIRED],
    409: [E.ASSISTANT_NO_FREE_SEAT, E.ASSISTANT_PHONE_TAKEN],
  })
  addAssistant(
    @CurrentUser() user: RequestUser,
    @Body() dto: AddAssistantDto,
    @Req() req: Request,
  ): Promise<TeamDto> {
    return this.assistants.add(user, dto, metaOf(req));
  }

  @AttorneyOnly()
  @Patch('team/:id')
  @ApiOperation({ summary: 'Rename an assistant or change their duties' })
  @ApiEnvelopeResponse(TeamDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  updateAssistant(
    @CurrentUser() user: RequestUser,
    @Param() p: AssistantIdParamDto,
    @Body() dto: UpdateAssistantDto,
    @Req() req: Request,
  ): Promise<TeamDto> {
    return this.assistants.update(user, p.id, dto, metaOf(req));
  }

  @AttorneyOnly()
  @Delete('team/:id')
  @ApiOperation({ summary: 'Remove an assistant (access ends at once)' })
  @ApiEnvelopeResponse(TeamDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  removeAssistant(
    @CurrentUser() user: RequestUser,
    @Param() p: AssistantIdParamDto,
  ): Promise<TeamDto> {
    return this.assistants.remove(user, p.id);
  }

  @AttorneyOnly()
  @Get('team/activity')
  @ApiOperation({ summary: 'Everything the assistants did (hidden from them)' })
  @ApiEnvelopeResponse(ActivityDto, { isArray: true })
  getTeamActivity(
    @CurrentUser() user: RequestUser,
    @Query() q: ActivityQueryDto,
  ): Promise<{ items: ActivityDto[]; nextCursor: string | null }> {
    return this.assistants.activity(user, q.membershipId, q.cursor);
  }

  // --- approval requests ----------------------------------------------------

  @Post('team/requests')
  @ApiOperation({
    summary: 'Assistant: ask the attorney to publish / apply something',
  })
  @ApiEnvelopeResponse(AssistantRequestDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.ASSISTANT_NOT_ALLOWED] })
  createAssistantRequest(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateAssistantRequestDto,
  ): Promise<AssistantRequestDto> {
    return this.assistants.createRequest(user, dto);
  }

  @Get('team/requests')
  @ApiOperation({
    summary: 'Approval requests (an assistant sees only their own)',
  })
  @ApiEnvelopeResponse(AssistantRequestDto, { isArray: true })
  listAssistantRequests(
    @CurrentUser() user: RequestUser,
    @Query() q: RequestsQueryDto,
  ): Promise<{ items: AssistantRequestDto[]; nextCursor: string | null }> {
    return this.assistants.requests(user, q.status, q.cursor);
  }

  @AttorneyOnly()
  @Post('team/requests/:id/approve')
  @ApiOperation({ summary: 'Approve: published / applied as the attorney' })
  @ApiEnvelopeResponse(AssistantRequestDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  approveAssistantRequest(
    @CurrentUser() user: RequestUser,
    @Param() p: AssistantIdParamDto,
    @Body() dto: DecideRequestDto,
  ): Promise<AssistantRequestDto> {
    return this.assistants.approve(user, p.id, dto.note);
  }

  @AttorneyOnly()
  @Post('team/requests/:id/reject')
  @ApiOperation({ summary: 'Reject an approval request' })
  @ApiEnvelopeResponse(AssistantRequestDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  rejectAssistantRequest(
    @CurrentUser() user: RequestUser,
    @Param() p: AssistantIdParamDto,
    @Body() dto: DecideRequestDto,
  ): Promise<AssistantRequestDto> {
    return this.assistants.reject(user, p.id, dto.note);
  }

  // --- tasks ---------------------------------------------------------------

  @Post('tasks')
  @ApiOperation({ summary: 'Set a task for the attorney' })
  @ApiEnvelopeResponse(TaskDto)
  @ApiErrors({ 403: [E.ASSISTANT_NOT_ALLOWED], 422: [E.FILE_NOT_ATTACHABLE] })
  createTask(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateTaskDto,
  ): Promise<TaskDto> {
    return this.tasks.create(user, dto);
  }

  @Get('tasks')
  @ApiOperation({ summary: "The attorney's tasks (calendar order)" })
  @ApiEnvelopeResponse(TaskDto, { isArray: true })
  listTasks(
    @CurrentUser() user: RequestUser,
    @Query() q: TasksQueryDto,
  ): Promise<TaskDto[]> {
    return this.tasks.list(user, q);
  }

  @Get('tasks/:id')
  @ApiOperation({ summary: 'One task' })
  @ApiEnvelopeResponse(TaskDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  getTask(
    @CurrentUser() user: RequestUser,
    @Param() p: AssistantIdParamDto,
  ): Promise<TaskDto> {
    return this.tasks.get(user, p.id);
  }

  @Patch('tasks/:id/status')
  @ApiOperation({
    summary: 'Take / done / not done (+ note, + new time) / cancel',
  })
  @ApiEnvelopeResponse(TaskDto)
  @ApiErrors({ 403: [E.ASSISTANT_NOT_ALLOWED], 404: [E.NOT_FOUND] })
  setTaskStatus(
    @CurrentUser() user: RequestUser,
    @Param() p: AssistantIdParamDto,
    @Body() dto: UpdateTaskStatusDto,
  ): Promise<TaskDto> {
    return this.tasks.setStatus(user, p.id, dto);
  }

  // Owner 2026-10-01: a task's checklist steps.
  @Post('tasks/:id/steps')
  @ApiOperation({ summary: "Add a step to a task's checklist" })
  @ApiEnvelopeResponse(TaskDto)
  @ApiErrors({
    403: [E.ASSISTANT_NOT_ALLOWED],
    404: [E.NOT_FOUND],
    409: [E.TASK_CLOSED, E.TASK_STEPS_LIMIT],
  })
  addTaskStep(
    @CurrentUser() user: RequestUser,
    @Param() p: AssistantIdParamDto,
    @Body() dto: TaskStepInputDto,
  ): Promise<TaskDto> {
    return this.tasks.addStep(user, p.id, dto);
  }

  @Patch('tasks/:id/steps/:stepId')
  @ApiOperation({ summary: 'Check a step off / move it to another time' })
  @ApiEnvelopeResponse(TaskDto)
  @ApiErrors({
    403: [E.ASSISTANT_NOT_ALLOWED],
    404: [E.NOT_FOUND],
    409: [E.TASK_CLOSED],
  })
  updateTaskStep(
    @CurrentUser() user: RequestUser,
    @Param() p: TaskStepParamDto,
    @Body() dto: UpdateTaskStepDto,
  ): Promise<TaskDto> {
    return this.tasks.updateStep(user, p.id, p.stepId, dto);
  }

  @Delete('tasks/:id/steps/:stepId')
  @ApiOperation({ summary: 'Remove a step' })
  @ApiEnvelopeResponse(TaskDto)
  @ApiErrors({
    403: [E.ASSISTANT_NOT_ALLOWED],
    404: [E.NOT_FOUND],
    409: [E.TASK_CLOSED],
  })
  removeTaskStep(
    @CurrentUser() user: RequestUser,
    @Param() p: TaskStepParamDto,
  ): Promise<TaskDto> {
    return this.tasks.removeStep(user, p.id, p.stepId);
  }
}

function metaOf(req: Request) {
  return { ip: req.ip, userAgent: req.header('user-agent') };
}
