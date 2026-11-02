import React from 'react'
import { CheckCircle2, FileJson, Grid3x3, Layers, Workflow } from 'lucide-react'
import { Card, CardHeader } from './ui/Card'

const COLUMN_RULES = [
  { width: '~17%', cols: 2 },
  { width: '~25%', cols: 3 },
  { width: '~33%', cols: 4 },
  { width: '~50%', cols: 6 },
]

const WIDGET_MAPPING = [
  { element: 'KPI stat card / metric', widget: 'column2d', config: 'Annotation group with text labels and bold values' },
  { element: 'Bar / column chart', widget: 'column2d / bar2d', config: 'showValues: 1 and the configured chart theme' },
  { element: 'Pie / donut chart', widget: 'doughnut2d / pie2d', config: 'doughnutRadius: 55%, pieRadius: 85%' },
  { element: 'Data table', widget: 'table', config: 'tableConfig with column definitions' },
  { element: 'Insights / comments', widget: 'comment', config: 'headerText, bodyStyle, headerStyle' },
]

const VALIDATION_RULES = [
  <><strong>contentId</strong> and <strong>slideId</strong> match and are exactly 5 letters or numbers (e.g. CR001).</>,
  <><strong>pageId</strong>, <strong>tileId</strong> and <strong>widgetId</strong> are valid UUID v4 values.</>,
  <>Every <strong>widgetId</strong> referenced by a tile exists in the widgets array.</>,
  <>Column spans in each row add up to 12 without overlapping.</>,
]

const WORKFLOW = [
  'Load a design from the Figma plugin or upload a JSON export.',
  'Optionally set package details such as title and slide ID.',
  'Run the four pipeline stages, or run them all at once.',
  'Preview the layout, inspect components and download page.json.',
  'Revisit any run later from Saved analyses.',
]

export const StudentGuideView: React.FC = () => {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pb-16 sm:px-6 lg:px-8">
      <Card className="p-5 sm:p-6">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Workflow aria-hidden className="size-5 text-teal-600" />
              How Figma2Insight works
            </span>
          }
        />
        <ol className="stagger mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {WORKFLOW.map((step, i) => (
            <li key={i} style={{ ['--i' as string]: i }} className="rounded-xl border border-teal-100 bg-teal-50/70 p-4">
              <span className="grid size-7 place-items-center rounded-full bg-ink text-xs font-bold text-aqua-400">{i + 1}</span>
              <p className="mt-3 text-sm leading-relaxed text-teal-800">{step}</p>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="p-5 sm:p-6">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Grid3x3 aria-hidden className="size-5 text-teal-600" />
              The 12-column × 12-row grid
            </span>
          }
          description="Every slide is 12 columns wide and 12 rows tall. Each horizontal row of tiles adds up to 12."
        />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {COLUMN_RULES.map((rule) => (
            <div key={rule.cols} className="rounded-xl border border-teal-100 bg-white p-4 text-center">
              <p className="text-sm font-semibold text-teal-600">{rule.width} width</p>
              <p className="mt-1 font-heading text-2xl font-bold">{rule.cols} cols</p>
              <div className="mt-3 grid grid-cols-12 gap-0.5" aria-hidden>
                {Array.from({ length: 12 }).map((_, i) => (
                  <span key={i} className={i < rule.cols ? 'h-1.5 rounded-sm bg-aqua-500' : 'h-1.5 rounded-sm bg-teal-100'} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-aqua-200 bg-aqua-50 p-3.5 text-sm text-aqua-800">
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>Example:</strong> left sidebar (2) + main chart (8) + right panel (2) = 12.
          </span>
        </p>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-5 sm:p-6">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Layers aria-hidden className="size-5 text-teal-600" />
                Figma element → Vista widget mapping
              </span>
            }
          />
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <caption className="sr-only">How Figma elements map to Vista widget types</caption>
            <thead className="border-y border-teal-100 bg-teal-50 text-xs uppercase tracking-wider text-teal-600">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold sm:px-6">Figma element</th>
                <th scope="col" className="px-5 py-3 font-semibold">Vista widget</th>
                <th scope="col" className="px-5 py-3 font-semibold">Key configuration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-teal-100">
              {WIDGET_MAPPING.map((row) => (
                <tr key={row.element} className="transition-colors hover:bg-teal-50/60">
                  <th scope="row" className="px-5 py-3 font-medium text-ink sm:px-6">{row.element}</th>
                  <td className="px-5 py-3">
                    <code className="rounded-md bg-ink px-2 py-0.5 font-mono text-xs text-aqua-300">{row.widget}</code>
                  </td>
                  <td className="px-5 py-3 text-teal-700">{row.config}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="bg-brand-grid rounded-2xl p-5 text-white shadow-raised sm:p-6" aria-labelledby="validation-heading">
        <h2 id="validation-heading" className="flex items-center gap-2 text-lg font-bold text-white">
          <FileJson aria-hidden className="size-5 text-aqua-400" />
          Automatic validation rules
        </h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {VALIDATION_RULES.map((rule, i) => (
            <li key={i} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-teal-100">
              <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-aqua-400" />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
