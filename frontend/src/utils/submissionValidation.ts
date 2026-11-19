export interface SubmissionFormData {
  description: string
  startDate: string
  endDate: string
  semester: string
  quantity: number
  file: File | null
}

export type SubmissionFormErrors = Partial<Record<keyof SubmissionFormData, string>>

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg']

export function validateSubmission(data: SubmissionFormData): SubmissionFormErrors {
  const errors: SubmissionFormErrors = {}
  if (!data.description.trim()) errors.description = 'Informe a descrição da atividade.'
  if (!data.startDate) errors.startDate = 'Informe a data de início.'
  if (!data.endDate) errors.endDate = 'Informe a data de término.'
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    errors.endDate = 'A data de término não pode ser anterior à data de início.'
  }
  if (!/^\d{4}-[12]$/.test(data.semester)) {
    errors.semester = 'Selecione um semestre válido (exemplo: 2026-2).'
  }
  if (!Number.isInteger(data.quantity) || data.quantity < 1) {
    errors.quantity = 'A quantidade deve ser um inteiro maior que zero.'
  }
  if (!data.file) {
    errors.file = 'Selecione um comprovante.'
  } else {
    const extension = data.file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      errors.file = 'Formato não permitido. Utilize PDF, PNG, JPG ou JPEG.'
    } else if (data.file.size > MAX_FILE_SIZE) {
      errors.file = 'O arquivo deve ter no máximo 10 MB.'
    } else if (data.file.size === 0) {
      errors.file = 'O arquivo selecionado está vazio.'
    }
  }
  return errors
}
