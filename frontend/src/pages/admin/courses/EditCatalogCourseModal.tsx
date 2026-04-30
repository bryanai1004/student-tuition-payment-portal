import { useEffect, useState } from 'react'
import {
  fetchAdminCourseCategories,
  patchAdminCatalogCourse,
  type AdminCourseCategoryOption,
  type CourseCatalogItem,
} from '../../../lib/api'
import { courseCatalogTitle } from './courseCatalogDisplay'

type EditCatalogCourseModalProps = {
  row: CourseCatalogItem | null
  onClose: () => void
  onSaved: () => void
}

export function EditCatalogCourseModal({
  row,
  onClose,
  onSaved,
}: EditCatalogCourseModalProps) {
  const [unitsStr, setUnitsStr] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [categories, setCategories] = useState<AdminCourseCategoryOption[] | null>(
    null,
  )
  const [categoriesErr, setCategoriesErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (row == null) return
    const u = row.units
    if (u == null) setUnitsStr('')
    else if (typeof u === 'number' && Number.isFinite(u))
      setUnitsStr(String(u))
    else setUnitsStr(String(u).trim())
    setCategoryId(
      typeof row.category === 'string' && row.category.trim() !== ''
        ? row.category.trim()
        : '',
    )
    setErr(null)
  }, [row])

  useEffect(() => {
    if (row == null) return
    const ac = new AbortController()
    setCategoriesErr(null)
    void (async () => {
      try {
        const list = await fetchAdminCourseCategories({ signal: ac.signal })
        if (ac.signal.aborted) return
        setCategories(list)
      } catch (e) {
        if (ac.signal.aborted) return
        setCategories([])
        setCategoriesErr(
          e instanceof Error ? e.message : 'Could not load category list.',
        )
      }
    })()
    return () => ac.abort()
  }, [row])

  if (row == null) return null

  const seq = row.sequence_number
  const title = courseCatalogTitle(row)

  const submit = async () => {
    if (seq == null || !Number.isFinite(seq)) {
      setErr('This course row has no sequence number; reload the page or contact support.')
      return
    }
    const unitsNum = Number(unitsStr.trim())
    if (!Number.isFinite(unitsNum) || unitsNum < 0) {
      setErr('Credits (units) must be a non-negative number.')
      return
    }
    const origUnits =
      row.units == null
        ? null
        : typeof row.units === 'number'
          ? row.units
          : Number(String(row.units).trim())
    const origCat = (row.category ?? '').trim()
    const nextCat = categoryId.trim()
    const body: { units?: number; category?: string } = {}
    if (!Number.isFinite(origUnits as number) || unitsNum !== origUnits) {
      body.units = unitsNum
    }
    if (nextCat !== origCat) {
      body.category = nextCat
    }
    if (body.units === undefined && body.category === undefined) {
      setErr('Change credits or category before saving.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await patchAdminCatalogCourse({ sequenceNumber: seq, body })
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="admin-section-detail-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="admin-section-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-catalog-course-title"
      >
        <h2
          id="edit-catalog-course-title"
          className="admin-section-detail-modal__title"
        >
          Edit course catalog
        </h2>
        <p className="portal-text-muted admin-form-hint" style={{ marginTop: 0 }}>
          <strong>{row.code}</strong>
          {' — '}
          {title}
        </p>
        {seq == null ? (
          <p className="admin-form-message" role="alert">
            Missing course id for this row. Reload the page after updating the API.
          </p>
        ) : null}
        {categoriesErr != null ? (
          <p className="portal-text-muted admin-form-hint" role="status">
            {categoriesErr} You can still type a category code manually.
          </p>
        ) : null}
        {err != null ? (
          <p className="admin-form-message" role="alert">
            {err}
          </p>
        ) : null}
        <div className="portal-course-feedback-modal__field">
          <label htmlFor="edit-catalog-units">Credits (units)</label>
          <input
            id="edit-catalog-units"
            className="admin-input"
            type="number"
            min={0}
            step={0.5}
            value={unitsStr}
            onChange={(e) => setUnitsStr(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="portal-course-feedback-modal__field">
          <label htmlFor="edit-catalog-category">Category</label>
          {categories != null && categories.length > 0 ? (
            <select
              id="edit-catalog-category"
              className="admin-input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">— none / clear —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.category_id}>
                  {c.category_id} — {c.category_name}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="edit-catalog-category"
              className="admin-input"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              placeholder="e.g. M, C, D2"
              autoComplete="off"
            />
          )}
        </div>
        <div className="admin-section-detail-modal__actions">
          <button
            type="button"
            className="portal-btn portal-btn--secondary portal-btn--compact"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="portal-btn portal-btn--primary portal-btn--compact"
            disabled={busy || seq == null}
            onClick={() => void submit()}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
