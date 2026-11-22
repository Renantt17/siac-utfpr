import { z } from 'zod'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg']

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Informe seu RA ou e-mail institucional.'),
  password: z.string().min(1, 'Informe sua senha.'),
})

export const submissionSchema = z
  .object({
    enrollment: z.string().min(1, 'Selecione uma matrícula ativa.'),
    activity_item: z.string().min(1, 'Selecione a modalidade da atividade.'),
    description: z
      .string()
      .trim()
      .min(3, 'A descrição deve ter pelo menos 3 caracteres.')
      .max(255, 'A descrição deve ter no máximo 255 caracteres.'),
    activity_start_date: z.string().min(1, 'Informe a data de início.'),
    activity_end_date: z.string().min(1, 'Informe a data de término.'),
    declared_quantity: z.coerce
      .number({ message: 'Informe uma quantidade numérica válida.' })
      .positive('A quantidade deve ser maior que zero.'),
    file: z.custom<File | null>().nullable(),
    requireFile: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (
      data.activity_start_date &&
      data.activity_end_date &&
      data.activity_end_date < data.activity_start_date
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['activity_end_date'],
        message: 'A data de término não pode ser anterior à data de início.',
      })
    }
    if (data.requireFile && !data.file) {
      ctx.addIssue({
        code: 'custom',
        path: ['file'],
        message: 'Selecione um comprovante (PDF, JPG ou PNG).',
      })
    }
    if (data.file) {
      const ext = data.file.name.split('.').pop()?.toLowerCase() ?? ''
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        ctx.addIssue({
          code: 'custom',
          path: ['file'],
          message: 'Formato não permitido. Utilize PDF, PNG ou JPG.',
        })
      } else if (data.file.size <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['file'],
          message: 'O arquivo selecionado está vazio.',
        })
      } else if (data.file.size > MAX_FILE_SIZE) {
        ctx.addIssue({
          code: 'custom',
          path: ['file'],
          message: 'O arquivo deve ter no máximo 10 MB.',
        })
      }
    }
  })

export const evaluationSchema = z
  .object({
    decision: z.enum([
      'APPROVED',
      'APPROVED_WITH_ADJUSTMENTS',
      'CORRECTION_REQUESTED',
      'REJECTED',
    ]),
    validated_quantity: z.coerce.number().optional(),
    adjusted_activity_item: z.string().optional(),
    adjusted_semester: z.string().optional(),
    feedback: z.string().trim().max(2000, 'O parecer deve ter no máximo 2000 caracteres.'),
  })
  .superRefine((data, ctx) => {
    if (data.decision !== 'APPROVED' && !data.feedback) {
      ctx.addIssue({
        code: 'custom',
        path: ['feedback'],
        message: 'O parecer/justificativa é obrigatório para esta decisão.',
      })
    }
    if (data.decision === 'APPROVED_WITH_ADJUSTMENTS') {
      if (!data.validated_quantity || data.validated_quantity <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['validated_quantity'],
          message: 'Informe a quantidade validada maior que zero.',
        })
      }
      if (data.adjusted_semester && !/^\d{4}\.[12]$/.test(data.adjusted_semester)) {
        ctx.addIssue({
          code: 'custom',
          path: ['adjusted_semester'],
          message: 'Use o formato AAAA.1 ou AAAA.2.',
        })
      }
    }
  })

export const enrollmentSchema = z.object({
  student_id: z.coerce.number().int().positive('Selecione um estudante.'),
  course_id: z.coerce.number().int().positive('Selecione um curso.'),
  enrollment_date: z.string().min(1, 'Informe a data de ingresso.'),
})

export const suspensionSchema = z
  .object({
    enrollment_id: z.coerce.number().int().positive('Selecione uma matrícula.'),
    start_date: z.string().min(1, 'Informe a data inicial.'),
    end_date: z.string().min(1, 'Informe a data final.'),
    reason: z.string().trim().max(255).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.start_date && data.end_date && data.end_date < data.start_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'A data final não pode ser anterior à data inicial.',
      })
    }
  })

export const opportunitySchema = z
  .object({
    title: z.string().trim().min(3, 'Informe o título.').max(200),
    description: z.string().trim().min(3, 'Informe a descrição.'),
    campus: z.string().optional(),
    suggested_group_number: z.string().optional(),
    suggested_item_code: z.string().trim().max(15).optional(),
    start_date: z.string().min(1, 'Informe a data inicial.'),
    end_date: z.string().min(1, 'Informe a data final.'),
    estimated_hours: z.string().optional(),
    modality: z.enum(['PRESENCIAL', 'REMOTO', 'HIBRIDO']),
    is_external: z.boolean(),
    organizer_name: z.string().trim().min(2, 'Informe o organizador.').max(200),
    certification_rules: z.string().trim().min(3, 'Informe as regras de certificação.'),
  })
  .superRefine((data, ctx) => {
    if (data.start_date && data.end_date && data.end_date < data.start_date) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_date'],
        message: 'A data final não pode ser anterior à inicial.',
      })
    }
    const hasGroup = Boolean(data.suggested_group_number?.trim())
    const hasCode = Boolean(data.suggested_item_code?.trim())
    if (hasGroup !== hasCode) {
      ctx.addIssue({
        code: 'custom',
        path: ['suggested_item_code'],
        message: 'Informe grupo e código sugeridos juntos, ou deixe ambos vazios.',
      })
    }
  })
