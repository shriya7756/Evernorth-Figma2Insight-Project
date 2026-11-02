import React, { useMemo, useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { downloadJson } from '../lib/download'
import { formatBytes } from '../lib/format'
import { Alert } from './ui/Alert'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'

// Rendering multi-megabyte JSON into the DOM freezes the page; show a preview instead.
const PREVIEW_LIMIT = 400_000

interface JsonViewerModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  jsonData: unknown
  downloadFilename?: string
}

export const JsonViewerModal: React.FC<JsonViewerModalProps> = ({ isOpen, onClose, title, jsonData, downloadFilename }) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  const text = useMemo(() => (isOpen ? JSON.stringify(jsonData, null, 2) ?? '' : ''), [isOpen, jsonData])
  const truncated = text.length > PREVIEW_LIMIT

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
    window.setTimeout(() => setCopyState('idle'), 2200)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={`${formatBytes(new Blob([text]).size)}${downloadFilename ? ` · ${downloadFilename}` : ''}`}
      footer={
        <>
          <span role="status" className="mr-auto text-sm text-teal-600">
            {copyState === 'copied' && 'Copied to clipboard.'}
            {copyState === 'error' && <span className="text-danger-600">Couldn't access the clipboard.</span>}
          </span>
          <Button
            variant="secondary"
            onClick={handleCopy}
            icon={copyState === 'copied' ? <Check className="size-4 text-aqua-700" /> : <Copy className="size-4" />}
          >
            {copyState === 'copied' ? 'Copied' : 'Copy JSON'}
          </Button>
          {downloadFilename && (
            <Button variant="dark" icon={<Download className="size-4" />} onClick={() => downloadJson(jsonData, downloadFilename)}>
              Download
            </Button>
          )}
        </>
      }
    >
      {truncated && (
        <Alert tone="info" className="m-4 mb-0">
          Showing the first {formatBytes(PREVIEW_LIMIT)} of this file. Download it to see everything.
        </Alert>
      )}
      <pre className="scrollbar-thin m-4 overflow-auto rounded-xl bg-ink p-4 font-mono text-[13px] leading-relaxed text-teal-100">
        <code>{truncated ? `${text.slice(0, PREVIEW_LIMIT)}\n…` : text}</code>
      </pre>
    </Modal>
  )
}
