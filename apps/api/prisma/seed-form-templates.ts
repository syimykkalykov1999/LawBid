/** Owner 2026-10-20: the starter document forms (case tools). Created once
 * by the seed; after that the admin owns them (Content → Case document
 * forms), so re-running the seed never overwrites an edit. Plain, general
 * wording in English and Russian — the attorney checks every document
 * before it is used. */

interface Field {
  key: string;
  type: 'text' | 'textarea' | 'date' | 'number';
  required: boolean;
  label: { en: string; ru: string };
  prefill?: 'today' | 'attorney_name' | 'client_name' | 'case_title';
}

export interface StarterTemplate {
  slug: string;
  position: number;
  title: { en: string; ru: string };
  description: { en: string; ru: string };
  body: { en: string; ru: string };
  fields: Field[];
}

const date: Field = {
  key: 'date',
  type: 'date',
  required: true,
  label: { en: 'Date', ru: 'Дата' },
  prefill: 'today',
};
const client: Field = {
  key: 'client_name',
  type: 'text',
  required: true,
  label: { en: 'Client', ru: 'Клиент' },
  prefill: 'client_name',
};
const attorney: Field = {
  key: 'attorney_name',
  type: 'text',
  required: true,
  label: { en: 'Attorney', ru: 'Адвокат' },
  prefill: 'attorney_name',
};

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    slug: 'power-of-attorney',
    position: 10,
    title: { en: 'Power of attorney', ru: 'Доверенность' },
    description: {
      en: 'Limited power to act for the client in one matter.',
      ru: 'Право действовать от имени клиента по одному делу.',
    },
    fields: [
      client,
      attorney,
      {
        key: 'scope',
        type: 'textarea',
        required: true,
        label: {
          en: 'What the attorney may do',
          ru: 'Что вправе делать адвокат',
        },
      },
      {
        key: 'valid_until',
        type: 'date',
        required: false,
        label: { en: 'Valid until', ru: 'Действует до' },
      },
      {
        key: 'city',
        type: 'text',
        required: false,
        label: { en: 'City', ru: 'Город' },
      },
      date,
    ],
    body: {
      en: `# Power of attorney

I, {{client_name}}, appoint {{attorney_name}} as my attorney to act for me in the following matter:

{{scope}}

This power is limited to the matter above. It is valid until {{valid_until}} unless I cancel it earlier in writing.

City: {{city}}
Date: {{date}}

Client: {{client_name}}`,
      ru: `# Доверенность

Я, {{client_name}}, уполномочиваю {{attorney_name}} представлять мои интересы по следующему делу:

{{scope}}

Доверенность ограничена указанным делом. Действует до {{valid_until}}, если я не отменю её раньше в письменной форме.

Город: {{city}}
Дата: {{date}}

Доверитель: {{client_name}}`,
    },
  },
  {
    slug: 'legal-services-agreement',
    position: 20,
    title: {
      en: 'Legal services agreement',
      ru: 'Соглашение об оказании услуг',
    },
    description: {
      en: 'What the attorney does, for how much, from when.',
      ru: 'Что делает адвокат, за какую плату и с какого дня.',
    },
    fields: [
      client,
      attorney,
      {
        key: 'matter',
        type: 'textarea',
        required: true,
        label: { en: 'The matter', ru: 'Суть дела' },
        prefill: 'case_title',
      },
      {
        key: 'fee_terms',
        type: 'textarea',
        required: true,
        label: { en: 'Fee and payment terms', ru: 'Гонорар и порядок оплаты' },
      },
      {
        key: 'start_date',
        type: 'date',
        required: true,
        label: { en: 'Start date', ru: 'Дата начала' },
      },
      date,
    ],
    body: {
      en: `# Legal services agreement

This agreement is made on {{date}} between {{client_name}} (the client) and {{attorney_name}} (the attorney).

# 1. The matter
The attorney will represent the client in: {{matter}}

# 2. Start
The work starts on {{start_date}}.

# 3. Fees and payment
{{fee_terms}}

# 4. The client's duties
The client gives the attorney complete and true information and the documents needed, and answers requests in good time.

# 5. Confidentiality
The attorney keeps the client's information confidential as the law requires.

# 6. Ending the agreement
Either side may end this agreement in writing. Work done until then is paid for under section 3.

Client: {{client_name}}
Attorney: {{attorney_name}}`,
      ru: `# Соглашение об оказании юридических услуг

Настоящее соглашение заключено {{date}} между {{client_name}} (клиент) и {{attorney_name}} (адвокат).

# 1. Предмет
Адвокат представляет интересы клиента по делу: {{matter}}

# 2. Начало работы
Работа начинается {{start_date}}.

# 3. Гонорар и оплата
{{fee_terms}}

# 4. Обязанности клиента
Клиент сообщает адвокату полные и достоверные сведения, передаёт нужные документы и своевременно отвечает на запросы.

# 5. Конфиденциальность
Адвокат хранит сведения клиента в тайне в соответствии с законом.

# 6. Прекращение
Любая из сторон вправе прекратить соглашение письменно. Работа, выполненная до этого, оплачивается по разделу 3.

Клиент: {{client_name}}
Адвокат: {{attorney_name}}`,
    },
  },
  {
    slug: 'demand-letter',
    position: 30,
    title: { en: 'Demand letter', ru: 'Уведомление-требование' },
    description: {
      en: 'A written notice to the other side with a deadline.',
      ru: 'Письменное уведомление другой стороне со сроком.',
    },
    fields: [
      attorney,
      client,
      {
        key: 'recipient_name',
        type: 'text',
        required: true,
        label: { en: 'To', ru: 'Кому' },
      },
      {
        key: 'recipient_address',
        type: 'text',
        required: false,
        label: { en: 'Address', ru: 'Адрес' },
      },
      {
        key: 'facts',
        type: 'textarea',
        required: true,
        label: { en: 'What happened', ru: 'Что произошло' },
      },
      {
        key: 'demand',
        type: 'textarea',
        required: true,
        label: { en: 'What is required', ru: 'Что требуется' },
      },
      {
        key: 'deadline',
        type: 'date',
        required: true,
        label: { en: 'Respond by', ru: 'Ответить до' },
      },
      date,
    ],
    body: {
      en: `{{date}}

To: {{recipient_name}}
{{recipient_address}}

# Notice and demand

I write on behalf of my client, {{client_name}}.

# Facts
{{facts}}

# Demand
{{demand}}

Please respond in writing by {{deadline}}. If there is no response, my client may take further steps to protect their rights.

{{attorney_name}}
Attorney for {{client_name}}`,
      ru: `{{date}}

Кому: {{recipient_name}}
{{recipient_address}}

# Уведомление и требование

Обращаюсь от имени моего доверителя, {{client_name}}.

# Обстоятельства
{{facts}}

# Требование
{{demand}}

Прошу ответить письменно до {{deadline}}. При отсутствии ответа мой доверитель вправе предпринять дальнейшие шаги для защиты своих прав.

{{attorney_name}}
Адвокат {{client_name}}`,
    },
  },
  {
    slug: 'case-closing-letter',
    position: 40,
    title: { en: 'Case closing letter', ru: 'Письмо о завершении дела' },
    description: {
      en: 'Confirms the work is finished and what the client keeps.',
      ru: 'Подтверждает, что работа завершена, и что остаётся у клиента.',
    },
    fields: [
      client,
      attorney,
      {
        key: 'matter',
        type: 'textarea',
        required: true,
        label: { en: 'The matter', ru: 'Суть дела' },
        prefill: 'case_title',
      },
      {
        key: 'outcome',
        type: 'textarea',
        required: true,
        label: { en: 'Outcome', ru: 'Итог' },
      },
      {
        key: 'next_steps',
        type: 'textarea',
        required: false,
        label: {
          en: 'What the client should do next',
          ru: 'Что клиенту делать дальше',
        },
      },
      date,
    ],
    body: {
      en: `{{date}}

Dear {{client_name}},

My work on your matter is finished: {{matter}}

# Outcome
{{outcome}}

# What to do next
{{next_steps}}

Please keep copies of the documents I sent you. If anything changes, you can write to me in the case chat.

Sincerely,
{{attorney_name}}`,
      ru: `{{date}}

Уважаемый(ая) {{client_name}},

Моя работа по вашему делу завершена: {{matter}}

# Итог
{{outcome}}

# Что делать дальше
{{next_steps}}

Сохраните копии документов, которые я вам передал. Если что-то изменится, напишите мне в чате кейса.

С уважением,
{{attorney_name}}`,
    },
  },
];
