
import { useEffect, useState } from 'react'
import { Eye, FileText, Image as ImageIcon } from 'lucide-react'

interface FilePreviewProps {
  file: File | null
}

export default function FilePreview({ file }: FilePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }

    const url = URL.createObjectURL(file)
    setPreviewUrl(url)

    return () => {
      URL.revokeObjectURL(url)
    }
  }, [file])

  if (!file || !previewUrl) return null

  const extension = file.name.split('.').pop()?.toLowerCase()
  const isPdf = extension === 'pdf'
  const isImage = ['png', 'jpg', 'jpeg'].includes(extension ?? '')

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-siac-border bg-gray-50 p-4">
      <div className="flex items-center gap-2">
        <Eye size={20} aria-hidden="true" />
        <h3 className="font-semibold">
          Pré-visualização do comprovante
        </h3>
      </div>

      {isImage ? (
        <div className="flex justify-center">
          <img
            src={previewUrl}
            alt="Pré-visualização do comprovante selecionado"
            className="max-h-96 max-w-full rounded-lg object-contain"
          />
        </div>
      ) : isPdf ? (
        <iframe
          src={previewUrl}
          title="Pré-visualização do comprovante PDF"
          className="h-96 w-full rounded-lg border border-siac-border bg-white"
        />
      ) : (
        <p className="text-sm text-siac-muted">
          Pré-visualização indisponível para este formato.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-siac-muted">
          {isImage ? (
            <ImageIcon size={18} aria-hidden="true" />
          ) : (
            <FileText size={18} aria-hidden="true" />
          )}
          <span className="break-all">{file.name}</span>
        </div>

        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-blue-700 underline"
        >
          Abrir arquivo
        </a>
      </div>
    </div>
  )
}
