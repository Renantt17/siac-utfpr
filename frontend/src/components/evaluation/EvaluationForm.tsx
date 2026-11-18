
import { useState, type FormEvent } from 'react'
import { openSubmissionFile } from '../../services/submissionService'
import evaluationService, {
  type PendingSubmission,
  type EvaluationDecision,
} from '../../services/evaluationService'

interface EvaluationFormProps {
  submission: PendingSubmission
  onSuccess: () => void
  onCancel: () => void
}

export default function EvaluationForm({
  submission,
  onSuccess,
  onCancel,
}: EvaluationFormProps) {
  const [decision, setDecision] =
    useState<EvaluationDecision>('APPROVED')

  const [quantity, setQuantity] = useState(
    String(submission.declared_quantity)
  )

  const [feedback, setFeedback] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openingFile, setOpeningFile] = useState(false)

  async function handleOpenFile() {
    setError(null)
    setOpeningFile(true)
    try {
      await openSubmissionFile(submission.public_id)
    } catch {
      setError('Não foi possível abrir o comprovante.')
    } finally {
      setOpeningFile(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const validatedQuantity = Number(quantity)

    if (
      !Number.isInteger(validatedQuantity) ||
      validatedQuantity < 0 ||
      validatedQuantity > submission.declared_quantity
    ) {
      setError('Informe uma quantidade válida.')
      return
    }

    if (!feedback.trim()) {
      setError('Informe uma justificativa para a decisão.')
      return
    }

    const confirmation = window.confirm(
      decision === 'APPROVED'
        ? 'Confirma a aprovação desta atividade?'
        : 'Confirma a rejeição desta atividade?'
    )

    if (!confirmation) return

    setIsSubmitting(true)

    try {
      await evaluationService.evaluate(submission.public_id, {
        decision,
        validated_quantity:
          decision === 'REJECTED' ? 0 : validatedQuantity,
        feedback: feedback.trim(),
      })

      onSuccess()
    } catch {
      setError(
        'Não foi possível registrar a avaliação. Tente novamente.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-xl border border-siac-border bg-white p-6 shadow-sm"
    >
      <div>
        <h2 className="text-xl font-bold">
          Avaliar atividade
        </h2>
        <p className="mt-2 text-sm text-siac-muted">
          {submission.student} — {submission.activity}
        </p>
      </div>

      <div className="rounded-lg border border-siac-border bg-gray-50 p-4">
        <p className="mb-2 text-sm text-siac-muted">{submission.description}</p>
        <button type="button" onClick={() => void handleOpenFile()} disabled={openingFile || isSubmitting} className="text-sm font-semibold text-blue-700 underline disabled:opacity-50">
          {openingFile ? 'Abrindo comprovante...' : 'Abrir comprovante enviado'}
        </button>
      </div>

      <div>
        <label
          htmlFor="evaluation-decision"
          className="mb-2 block text-sm font-semibold"
        >
          Decisão
        </label>

        <select
          id="evaluation-decision"
          value={decision}
          onChange={(event) =>
            setDecision(event.target.value as EvaluationDecision)
          }
          disabled={isSubmitting}
          className="w-full rounded-lg border border-siac-border p-3"
        >
          <option value="APPROVED">Aprovar</option>
          <option value="REJECTED">Rejeitar</option>
        </select>
      </div>

      {decision === 'APPROVED' && (
        <div>
          <label
            htmlFor="validated-quantity"
            className="mb-2 block text-sm font-semibold"
          >
            Quantidade validada
          </label>

          <input
            id="validated-quantity"
            type="number"
            min="0"
            max={submission.declared_quantity}
            step="1"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            disabled={isSubmitting}
            required
            className="w-full rounded-lg border border-siac-border p-3"
          />

          <p className="mt-2 text-xs text-siac-muted">
            Quantidade declarada pelo estudante:{' '}
            {submission.declared_quantity}
          </p>
        </div>
      )}

      <div>
        <label
          htmlFor="evaluation-feedback"
          className="mb-2 block text-sm font-semibold"
        >
          Justificativa
        </label>

        <textarea
          id="evaluation-feedback"
          rows={4}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          disabled={isSubmitting}
          required
          className="w-full rounded-lg border border-siac-border p-3"
          placeholder="Descreva o motivo da decisão."
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-lg border border-siac-border px-5 py-3 font-semibold hover:bg-gray-50 disabled:opacity-50"
        >
          Cancelar
        </button>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-utfpr-yellow px-5 py-3 font-semibold text-utfpr-black hover:brightness-95 disabled:opacity-50"
        >
          {isSubmitting ? 'Enviando...' : 'Confirmar avaliação'}
        </button>
      </div>
    </form>
  )
}
