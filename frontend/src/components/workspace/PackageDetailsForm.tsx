import { useId } from 'react'
import { RotateCcw } from 'lucide-react'
import { PackageDetails } from '../../types'
import { DEFAULT_PACKAGE, PackageErrors, validatePackageDetails } from '../../lib/validation'
import { Button } from '../ui/Button'
import { Card, CardHeader } from '../ui/Card'
import { TextField } from '../ui/Field'

interface PackageDetailsFormProps {
  value: PackageDetails
  errors: PackageErrors
  disabled?: boolean
  onChange: (value: PackageDetails) => void
  onErrorsChange: (errors: PackageErrors) => void
}

/** Optional slide-package metadata applied when the layout is generated. */
export function PackageDetailsForm({ value, errors, disabled, onChange, onErrorsChange }: PackageDetailsFormProps) {
  const headingId = useId()

  const update = (field: keyof PackageDetails, next: string) => {
    const updated = { ...value, [field]: next }
    onChange(updated)
    // Clear a field's error as soon as it becomes valid.
    if (errors[field]) {
      const fieldError = validatePackageDetails(updated)[field]
      onErrorsChange({ ...errors, [field]: fieldError })
    }
  }

  const validateField = (field: keyof PackageDetails) => {
    onErrorsChange({ ...errors, [field]: validatePackageDetails(value)[field] })
  }

  const isDefault = (Object.keys(DEFAULT_PACKAGE) as (keyof PackageDetails)[]).every((k) => value[k] === DEFAULT_PACKAGE[k])

  return (
    <Card className="p-5 sm:p-6" aria-labelledby={headingId}>
      <CardHeader
        id={headingId}
        eyebrow="Step 2 · Package details"
        title="Describe the output"
        description="Used for the generated page.json and saved with the analysis. Defaults work fine."
        actions={
          !isDefault && (
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw className="size-4" />}
              onClick={() => {
                onChange(DEFAULT_PACKAGE)
                onErrorsChange({})
              }}
              disabled={disabled}
            >
              Reset
            </Button>
          )
        }
      />
      <form
        noValidate
        className="mt-5 grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => e.preventDefault()}
        aria-describedby={`${headingId}-note`}
      >
        <TextField
          className="sm:col-span-2"
          label="Dashboard title"
          optional
          placeholder="Uses the Figma frame name when blank"
          value={value.title}
          maxLength={140}
          error={errors.title}
          disabled={disabled}
          onChange={(e) => update('title', e.target.value)}
          onBlur={() => validateField('title')}
        />
        <TextField
          label="Slide ID"
          optional
          placeholder="e.g. CR001"
          hint="5 letters or numbers. Auto-generated when blank."
          value={value.slideId}
          maxLength={8}
          autoCapitalize="characters"
          spellCheck={false}
          error={errors.slideId}
          disabled={disabled}
          onChange={(e) => update('slideId', e.target.value.toUpperCase())}
          onBlur={() => validateField('slideId')}
          className="[&_input]:font-mono [&_input]:uppercase"
        />
        <TextField
          label="Subject area"
          placeholder="sales"
          value={value.subjectArea}
          spellCheck={false}
          error={errors.subjectArea}
          disabled={disabled}
          required
          onChange={(e) => update('subjectArea', e.target.value)}
          onBlur={() => validateField('subjectArea')}
        />
        <TextField
          label="Topic"
          placeholder="analytics"
          value={value.topic}
          spellCheck={false}
          error={errors.topic}
          disabled={disabled}
          required
          onChange={(e) => update('topic', e.target.value)}
          onBlur={() => validateField('topic')}
        />
        <TextField
          label="Slide name"
          placeholder="dashboard-summary"
          value={value.slideName}
          spellCheck={false}
          error={errors.slideName}
          disabled={disabled}
          required
          onChange={(e) => update('slideName', e.target.value)}
          onBlur={() => validateField('slideName')}
        />
      </form>
      <p id={`${headingId}-note`} className="mt-4 text-xs text-teal-600">
        Subject area, topic and slide name use lowercase words joined by hyphens.
      </p>
    </Card>
  )
}
