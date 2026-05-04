/**
 * Smoke: load academics + program progress for one student external id (requires MySQL in .env).
 * Run from backend: npx tsx scripts/smoke-academics-progress.ts <STUDENT_ID>
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { getStudentAcademicsPayload } from '../src/services/studentAcademicsService.js'
import { getStudentProgramProgressPayload } from '../src/services/programProgressService.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(root, '.env') })

const id = process.argv[2]?.trim() || 'TEST'
console.log('[env] .env loaded from', path.join(root, '.env'))
console.log('[smoke] student id:', id)

let code = 0
try {
  console.log('[smoke] academics …')
  const ac = await getStudentAcademicsPayload(id)
  const wRows = ac.transcript.filter((r) => (r.grade ?? '').trim().toUpperCase() === 'W')
  console.log('[smoke] academics OK', {
    transcriptRows: ac.transcript.length,
    transcriptWCount: wRows.length,
    courseRecordCount: ac.courseRecords.length,
  })
} catch (e) {
  console.error('[smoke] academics FAILED', e)
  code = 1
}

try {
  console.log('[smoke] program-progress …')
  const pp = await getStudentProgramProgressPayload(id)
  console.log('[smoke] program-progress OK', {
    quarterUnitsEarned: pp.quarterUnitsEarned,
    quarterUnitsInProgress: pp.quarterUnitsInProgress,
    quarterUnitsRemaining: pp.quarterUnitsRemaining,
    buckets: pp.buckets.map((b) => ({
      id: b.id,
      completed: b.completed,
      inProgress: b.inProgress,
      remaining: b.remaining,
    })),
  })
} catch (e) {
  console.error('[smoke] program-progress FAILED', e)
  code = 1
}

process.exit(code)
