import type { ReactNode } from 'react'
import { ChevronDown, HelpCircle } from 'lucide-react'

const STEPS: { title: string; body: ReactNode }[] = [
  {
    title: 'Open the design in Figma',
    body: (
      <>
        Open the file in the browser or desktop app. Copy the <strong>file key</strong> from its URL:{' '}
        <code className="break-all">figma.com/design/<mark className="bg-aqua-100 px-0.5">FILE_KEY</mark>/…</code>
      </>
    ),
  },
  {
    title: 'Select the dashboard frame',
    body: (
      <>
        Click the top-level frame that contains the dashboard, then right-click → <em>Copy/Paste as</em> →{' '}
        <em>Copy link to selection</em>. The link ends in <code>node-id=12-345</code>; that frame’s id is{' '}
        <code>12:345</code> (replace the hyphen with a colon).
      </>
    ),
  },
  {
    title: 'Extract the design JSON',
    body: (
      <>
        Figma has no “Export JSON” menu, so use the Figma REST API with a personal access token (Figma → Settings →
        Security → <em>Personal access tokens</em>, scope <em>File content: read</em>). Keep the token private and never
        paste it into Figma2Insight.
        <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-3 text-[11px] leading-relaxed text-aqua-200 scrollbar-thin">
          {`curl -H "X-Figma-Token: YOUR_TOKEN" \\
  "https://api.figma.com/v1/files/FILE_KEY/nodes?ids=12:345" \\
  -o dashboard.json`}
        </pre>
        On Windows PowerShell type <code>curl.exe</code>. Leave out <code>/nodes?ids=…</code> to export the whole file
        instead.
      </>
    ),
  },
  {
    title: 'Save the JSON',
    body: (
      <>
        The command saves <code>dashboard.json</code>. It should start with <code>{'{"name": …, "nodes": {'}</code> (one frame) or{' '}
        <code>{'{"document": {'}</code> (whole file). Check its size against the limit shown above.
      </>
    ),
  },
  {
    title: 'Upload it here',
    body: (
      <>
        Drop <code>dashboard.json</code> above, then run the pipeline. Prefer no token? Use the{' '}
        <strong>Figma plugin</strong> tab instead — the plugin sends the selected frame directly.
      </>
    ),
  },
]

/** Collapsible instructions for getting a design JSON out of Figma in a format the parser accepts. */
export function FigmaJsonHelp() {
  return (
    <details className="group mt-4 rounded-xl border border-teal-200 bg-white text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 font-semibold text-ink transition-colors hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-aqua-300 [&::-webkit-details-marker]:hidden">
        <HelpCircle aria-hidden className="size-4 text-teal-600" />
        How to extract JSON from Figma?
        <ChevronDown aria-hidden className="ml-auto size-4 text-teal-600 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <ol className="space-y-3 px-4 pb-4 pt-1">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-700">
              {i + 1}
            </span>
            <div className="min-w-0 leading-relaxed text-teal-700">
              <p className="font-semibold text-ink">{step.title}</p>
              <div className="mt-0.5 [&_code]:rounded [&_code]:bg-teal-50 [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_code]:text-ink">
                {step.body}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </details>
  )
}
