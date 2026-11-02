/** Save a value as a pretty-printed JSON file in the browser. */
export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Trigger a download for a same-origin URL without leaving the page. */
export function downloadUrl(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  a.download = ''
  document.body.appendChild(a)
  a.click()
  a.remove()
}
