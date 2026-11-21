import { useEffect, useState, type FormEvent } from 'react'
import axios from 'axios'

import { evaluationSchema } from '../../schemas'
import activityCatalogService, { type ActivityItem } from '../../services/activityCatalogService'
import evaluationService, { type EvaluationDecision } from '../../services/evaluationService'
import { openSubmissionFile, type Submission } from '../../services/submissionService'
import { Alert } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Input, Label, Textarea } from '../ui/input'
import { Select } from '../ui/select'

interface EvaluationFormProps {
  submission: Submission
  onSuccess: () => void
  onCancel: () => void
}

export default function EvaluationForm({ submission, onSuccess, onCancel }: EvaluationFormProps) {
  const [decision, setDecision] = useState<EvaluationDecision>('APPROVED')
  const [quantity, setQuantity] = useState(submission.declared_quantity)
  const [adjustedItem, setAdjustedItem] = useState(String(submission.activity_item))
  const [adjustedSemester, setAdjustedSemester] = useState(submission.semester)
  const [feedback, setFeedback] = useState('')
  const [catalogItems, setCatalogItems] = useState<ActivityItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [openingFile, setOpeningFile] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void activityCatalogService
      .scoringTable(submission.course_id)
      .then((groups) => setCatalogItems(groups.flatMap((g) => g.activities.filter((a) => a.is_selectable))))
      .catch(() => setCatalogItems([]))
  }, [submission.course_id])

  async function handleOpenFile() {
    setOpeningFile(true)
    setError('')
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
    setError('')

    const parsed = evaluationSchema.safeParse({
      decision,
      validated_quantity: quantity,
      adjusted_activity_item: adjustedItem,
      adjusted_semester: adjustedSemester,
      feedback,
    })

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Verifique os campos da avaliação.')
      return
    }

    setIsSubmitting(true)
    try {
      await evaluationService.evaluate(submission.public_id, {
        decision: parsed.data.decision,
        validated_quantity:
          parsed.data.decision === 'APPROVED_WITH_ADJUSTMENTS'
            ? parsed.data.validated_quantity
            : undefined,
        adjusted_activity_item:
          parsed.data.decision === 'APPROVED_WITH_ADJUSTMENTS'
            ? Number(parsed.data.adjusted_activity_item)
            : undefined,
        adjusted_semester:
          parsed.data.decision === 'APPROVED_WITH_ADJUSTMENTS'
            ? parsed.data.adjusted_semester
            : undefined,
        feedback: parsed.data.feedback,
        row_version: submission.row_version,
      })
      onSuccess()
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as Record<string, unknown> | undefined
        if (typeof d?.detail === 'string') setError(d.detail)
        else if (d && typeof d === 'object') {
          const first = Object.values(d)[0]
          setError(Array.isArray(first) ? String(first[0]) : String(first))
        } else setError('Falha ao registrar avaliação.')
      } else {
        setError('Não foi possível registrar a avaliação.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avaliar atividade de {submission.student}</CardTitle>
        <p className="text-sm text-siac-muted">
          {submission.course} • G{submission.group_number} / {submission.activity_code} —{' '}
          {submission.activity}
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border border-siac-border bg-gray-50 p-4 text-sm">
            <p>
              <strong>Descrição:</strong> {submission.description}
            </p>
            <p className="mt-1">
              <strong>Período:</strong> {submission.activity_start_date} a {submission.activity_end_date} (
              {submission.semester}) • <strong>Quantidade declarada:</strong> {submission.declared_quantity}{' '}
              {submission.applied_unit_name} • <strong>Prévia:</strong> {submission.calculated_points} pts
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void handleOpenFile()}
              disabled={openingFile}
            >
              {openingFile ? 'Abrindo...' : 'Abrir comprovante enviado'}
            </Button>
          </div>

          <div>
            <Label htmlFor="eval-decision">Decisão docente</Label>
            <Select
              id="eval-decision"
              value={decision}
              onChange={(e) => setDecision(e.target.value as EvaluationDecision)}
            >
              <option value="APPROVED">Aprovar diretamente</option>
              <option value="APPROVED_WITH_ADJUSTMENTS">Aprovar com ajustes mínimos</option>
              <option value="CORRECTION_REQUESTED">Solicitar correções ao estudante</option>
              <option value="REJECTED">Indeferir (Rejeição definitiva)</option>
            </Select>
          </div>

          {decision === 'APPROVED_WITH_ADJUSTMENTS' && (
            <div className="grid gap-4 rounded-lg border border-yellow-300 bg-yellow-50/50 p-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="adj-item">Reenquadrar item</Label>
                <Select
                  id="adj-item"
                  value={adjustedItem}
                  onChange={(e) => setAdjustedItem(e.target.value)}
                >
                  {catalogItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      G{it.group_number} / {it.code} — {it.description}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="adj-sem">Semestre (AAAA.1/2)</Label>
                <Input
                  id="adj-sem"
                  value={adjustedSemester}
                  onChange={(e) => setAdjustedSemester(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="adj-qty">Quantidade validada</Label>
                <Input
                  id="adj-qty"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="eval-feedback">
              Parecer / Justificativa {decision !== 'APPROVED' ? '(obrigatório)' : '(opcional)'}
            </Label>
            <Textarea
              id="eval-feedback"
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Descreva a justificativa, orientações de correção ou ajustes aplicados."
            />
          </div>

          {error && <Alert variant="danger">{error}</Alert>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Salvando...' : 'Confirmar decisão'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
