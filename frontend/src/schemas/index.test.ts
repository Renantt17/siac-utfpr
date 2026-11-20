import { describe, expect, it } from 'vitest'
import {
  enrollmentSchema,
  evaluationSchema,
  loginSchema,
  opportunitySchema,
  submissionSchema,
  suspensionSchema,
} from './index'

describe('Schemas Zod de validação do SIAC', () => {
  it('valida login híbrido (RA ou e-mail) e rejeita campos vazios', () => {
    expect(loginSchema.safeParse({ identifier: 'a2500001', password: '123' }).success).toBe(true)
    expect(loginSchema.safeParse({ identifier: 'coord@utfpr.edu.br', password: '123' }).success).toBe(true)
    expect(loginSchema.safeParse({ identifier: '   ', password: '123' }).success).toBe(false)
    expect(loginSchema.safeParse({ identifier: 'a2500001', password: '' }).success).toBe(false)
  })

  it('valida datas, extensão, tamanho e presença de comprovante na submissão', () => {
    const validPdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'cert.pdf', {
      type: 'application/pdf',
    })

    const ok = submissionSchema.safeParse({
      enrollment: '1',
      activity_item: '10',
      description: 'Participação em Congresso',
      activity_start_date: '2025-03-01',
      activity_end_date: '2025-03-03',
      declared_quantity: 1,
      file: validPdf,
      requireFile: true,
    })
    expect(ok.success).toBe(true)

    const invertedDates = submissionSchema.safeParse({
      enrollment: '1',
      activity_item: '10',
      description: 'Participação em Congresso',
      activity_start_date: '2025-03-10',
      activity_end_date: '2025-03-03',
      declared_quantity: 1,
      file: validPdf,
      requireFile: true,
    })
    expect(invertedDates.success).toBe(false)

    const badExt = new File(['<html></html>'], 'hack.html', { type: 'text/html' })
    const invalidFile = submissionSchema.safeParse({
      enrollment: '1',
      activity_item: '10',
      description: 'Participação em Congresso',
      activity_start_date: '2025-03-01',
      activity_end_date: '2025-03-03',
      declared_quantity: 1,
      file: badExt,
      requireFile: true,
    })
    expect(invalidFile.success).toBe(false)
  })

  it('exige justificativa obrigatória em ajustes/correção/indeferimento e formato AAAA.1/2', () => {
    expect(
      evaluationSchema.safeParse({
        decision: 'APPROVED',
        feedback: '',
      }).success,
    ).toBe(true)

    expect(
      evaluationSchema.safeParse({
        decision: 'REJECTED',
        feedback: '',
      }).success,
    ).toBe(false)

    expect(
      evaluationSchema.safeParse({
        decision: 'APPROVED_WITH_ADJUSTMENTS',
        validated_quantity: 2,
        adjusted_semester: '2025-1',
        feedback: 'Ajustado',
      }).success,
    ).toBe(false)

    expect(
      evaluationSchema.safeParse({
        decision: 'APPROVED_WITH_ADJUSTMENTS',
        validated_quantity: 2,
        adjusted_semester: '2025.1',
        feedback: 'Ajustado conforme regulamento',
      }).success,
    ).toBe(true)
  })

  it('valida matrícula, trancamento com datas consistentes e oportunidades', () => {
    expect(
      enrollmentSchema.safeParse({ student_id: 1, course_id: 2, enrollment_date: '2025-01-10' }).success,
    ).toBe(true)

    expect(
      suspensionSchema.safeParse({
        enrollment_id: 1,
        start_date: '2025-05-10',
        end_date: '2025-05-01',
      }).success,
    ).toBe(false)

    expect(
      opportunitySchema.safeParse({
        title: 'Hackathon UTFPR',
        description: 'Evento de programação',
        suggested_group_number: '3',
        suggested_item_code: '',
        start_date: '2025-06-01',
        end_date: '2025-06-02',
        modality: 'PRESENCIAL',
        is_external: false,
        organizer_name: 'DACOMP',
        certification_rules: 'Presença integral',
      }).success,
    ).toBe(false)
  })
})
