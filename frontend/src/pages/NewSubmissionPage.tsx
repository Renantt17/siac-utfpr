
import { useEffect, useState, type FormEvent } from 'react'
import {
  FileUp,
  ClipboardList,
  Info,
  CheckCircle2,
  AlertCircle,
  Save,
  Trash2,
} from 'lucide-react'

import AppLayout from '../components/layout/AppLayout'
import FilePreview from '../components/submission/FilePreview'

import {
  validateSubmission,
  type SubmissionFormErrors,
} from '../utils/submissionValidation'

const DRAFT_KEY = 'siac-activity-draft'

const AVAILABLE_SEMESTERS = [
  '2026.2',
  '2026.1',
  '2025.2',
  '2025.1',
  '2024.2',
  '2024.1',
]

interface ActivityDraft {
  description: string
  startDate: string
  endDate: string
  semester: string
  quantity: number
}

function loadDraft(): ActivityDraft {
  const emptyDraft: ActivityDraft = {
    description: '',
    startDate: '',
    endDate: '',
    semester: '',
    quantity: 1,
  }

  try {
    const saved = localStorage.getItem(DRAFT_KEY)

    if (!saved) return emptyDraft

    const parsed = JSON.parse(saved) as Partial<ActivityDraft>

    return {
      description:
        typeof parsed.description === 'string'
          ? parsed.description
          : '',
      startDate:
        typeof parsed.startDate === 'string'
          ? parsed.startDate
          : '',
      endDate:
        typeof parsed.endDate === 'string'
          ? parsed.endDate
          : '',
      semester:
        typeof parsed.semester === 'string' &&
        AVAILABLE_SEMESTERS.includes(parsed.semester)
          ? parsed.semester
          : '',
      quantity:
        typeof parsed.quantity === 'number' &&
        Number.isFinite(parsed.quantity)
          ? parsed.quantity
          : 1,
    }
  } catch {
    return emptyDraft
  }
}

export default function NewSubmissionPage() {
  const [initialDraft] = useState(loadDraft)

  const [description, setDescription] = useState(
    initialDraft.description
  )
  const [startDate, setStartDate] = useState(
    initialDraft.startDate
  )
  const [endDate, setEndDate] = useState(
    initialDraft.endDate
  )
  const [semester, setSemester] = useState(
    initialDraft.semester
  )
  const [quantity, setQuantity] = useState(
    initialDraft.quantity
  )
  const [file, setFile] = useState<File | null>(null)

  const [errors, setErrors] =
    useState<SubmissionFormErrors>({})

  const [validationSuccess, setValidationSuccess] =
    useState(false)

  const [draftSaved, setDraftSaved] = useState(
    Boolean(
      initialDraft.description ||
      initialDraft.startDate ||
      initialDraft.endDate ||
      initialDraft.semester
    )
  )

  useEffect(() => {
    const draft: ActivityDraft = {
      description,
      startDate,
      endDate,
      semester,
      quantity,
    }

    const hasContent =
      description.trim() !== '' ||
      startDate !== '' ||
      endDate !== '' ||
      semester !== '' ||
      quantity !== 1

    try {
      if (hasContent) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
        setDraftSaved(true)
      } else {
        localStorage.removeItem(DRAFT_KEY)
        setDraftSaved(false)
      }
    } catch {
      setDraftSaved(false)
    }
  }, [description, startDate, endDate, semester, quantity])

  function clearValidation() {
    setErrors({})
    setValidationSuccess(false)
  }

  function handleClearDraft() {
    localStorage.removeItem(DRAFT_KEY)

    setDescription('')
    setStartDate('')
    setEndDate('')
    setSemester('')
    setQuantity(1)
    setFile(null)
    setDraftSaved(false)

    clearValidation()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const validationErrors = validateSubmission({
      description,
      startDate,
      endDate,
      semester,
      quantity,
      file,
    })

    setErrors(validationErrors)

    setValidationSuccess(
      Object.keys(validationErrors).length === 0
    )
  }

  const inputClass =
    'mt-2 w-full rounded-lg border border-siac-border bg-white px-4 py-3 text-sm text-utfpr-black focus:outline-none focus:ring-2 focus:ring-utfpr-yellow'

  return (
    <AppLayout>
      <section className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-utfpr-black">
            Enviar atividade
          </h1>

          <p className="mt-2 text-siac-muted">
            Cadastre sua atividade complementar e anexe o comprovante.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 p-4">
          <Info
            size={22}
            className="shrink-0 text-utfpr-black"
            aria-hidden="true"
          />

          <p className="text-sm text-gray-800">
            O formulário pode ser preenchido e validado.
            O envio definitivo ficará disponível após a integração
            das matrículas e dos tipos de atividades.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-siac-border bg-white p-4">
          <div className="flex items-center gap-2">
            <Save
              size={20}
              className="text-siac-muted"
              aria-hidden="true"
            />

            <span className="text-sm text-siac-muted">
              {draftSaved
                ? 'Rascunho salvo automaticamente neste navegador.'
                : 'O preenchimento será salvo automaticamente.'}
            </span>
          </div>

          <button
            type="button"
            onClick={handleClearDraft}
            className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            <Trash2 size={16} aria-hidden="true" />
            Limpar rascunho
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-6 rounded-xl border border-siac-border bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-3 border-b border-siac-border pb-4">
            <ClipboardList
              size={22}
              className="text-utfpr-black"
              aria-hidden="true"
            />

            <h2 className="text-lg font-semibold">
              Dados da atividade
            </h2>
          </div>

          <div>
            <label
              htmlFor="description"
              className="text-sm font-medium"
            >
              Descrição da atividade
            </label>

            <textarea
              id="description"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value)
                clearValidation()
              }}
              rows={4}
              required
              aria-invalid={Boolean(errors.description)}
              placeholder="Descreva a atividade complementar realizada."
              className={inputClass}
            />

            {errors.description && (
              <p className="mt-2 text-sm text-red-700">
                {errors.description}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="startDate"
                className="text-sm font-medium"
              >
                Data de início
              </label>

              <input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value)
                  clearValidation()
                }}
                required
                aria-invalid={Boolean(errors.startDate)}
                className={inputClass}
              />

              {errors.startDate && (
                <p className="mt-2 text-sm text-red-700">
                  {errors.startDate}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="endDate"
                className="text-sm font-medium"
              >
                Data de término
              </label>

              <input
                id="endDate"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) => {
                  setEndDate(event.target.value)
                  clearValidation()
                }}
                required
                aria-invalid={Boolean(errors.endDate)}
                className={inputClass}
              />

              {errors.endDate && (
                <p className="mt-2 text-sm text-red-700">
                  {errors.endDate}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="semester"
                className="text-sm font-medium"
              >
                Semestre letivo
              </label>

              <select
                id="semester"
                value={semester}
                onChange={(event) => {
                  setSemester(event.target.value)
                  clearValidation()
                }}
                required
                aria-invalid={Boolean(errors.semester)}
                className={inputClass}
              >
                <option value="">
                  Selecione o semestre
                </option>

                {AVAILABLE_SEMESTERS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              {errors.semester && (
                <p className="mt-2 text-sm text-red-700">
                  {errors.semester}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="quantity"
                className="text-sm font-medium"
              >
                Quantidade declarada
              </label>

              <input
                id="quantity"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(event) => {
                  setQuantity(Number(event.target.value))
                  clearValidation()
                }}
                required
                aria-invalid={Boolean(errors.quantity)}
                className={inputClass}
              />

              {errors.quantity && (
                <p className="mt-2 text-sm text-red-700">
                  {errors.quantity}
                </p>
              )}
            </div>
          </div>

          <div className="border-t border-siac-border pt-6">
            <label
              htmlFor="file"
              className="flex items-center gap-2 text-sm font-medium"
            >
              <FileUp size={20} aria-hidden="true" />
              Comprovante da atividade
            </label>

            <input
              id="file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null)
                clearValidation()
              }}
              required
              aria-invalid={Boolean(errors.file)}
              className={`${inputClass} file:mr-4 file:rounded-md file:border-0 file:bg-yellow-100 file:px-4 file:py-2 file:font-medium`}
            />

            {file && (
              <p className="mt-2 text-sm text-siac-muted">
                Arquivo selecionado: {file.name}{' '}
                ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}

            {errors.file && (
              <p className="mt-2 text-sm text-red-700">
                {errors.file}
              </p>
            )}

            <FilePreview file={file} />
          </div>

          {Object.keys(errors).length > 0 && (
            <div
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 p-4"
            >
              <div className="flex items-center gap-2">
                <AlertCircle
                  size={20}
                  className="text-red-700"
                  aria-hidden="true"
                />

                <p className="font-semibold text-red-700">
                  Corrija os seguintes problemas:
                </p>
              </div>

              <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
                {Object.entries(errors).map(([field, message]) => (
                  <li key={field}>
                    {message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {validationSuccess && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 p-4"
            >
              <CheckCircle2
                size={22}
                className="shrink-0 text-green-700"
                aria-hidden="true"
              />

              <div>
                <p className="font-semibold text-green-800">
                  Formulário validado com sucesso!
                </p>

                <p className="mt-1 text-sm text-green-800">
                  Os campos passaram pelas verificações locais.
                  Nenhuma atividade foi enviada ao sistema.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3 border-t border-siac-border pt-6">
            <button
              type="submit"
              className="rounded-lg border border-utfpr-black bg-white px-6 py-3 font-semibold text-utfpr-black transition-colors hover:bg-gray-100"
            >
              Verificar formulário
            </button>

            <button
              type="button"
              disabled
              title="Aguardando integração das matrículas e atividades"
              className="cursor-not-allowed rounded-lg bg-utfpr-yellow px-6 py-3 font-semibold text-utfpr-black opacity-50"
            >
              Enviar atividade
            </button>
          </div>
        </form>
      </section>
    </AppLayout>
  )
}
