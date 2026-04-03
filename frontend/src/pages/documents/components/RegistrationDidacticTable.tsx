import type { RegistrationDidacticRow } from '../../../lib/registrationFormAdapter'

type Props = {
  rows: RegistrationDidacticRow[]
  totalUnits: number
}

export function RegistrationDidacticTable({ rows, totalUnits }: Props) {
  const displayRows = rows.length > 0 ? rows : []
  const padRows = 6
  const emptySlots = Math.max(0, padRows - displayRows.length)

  return (
    <div className="portal-registration-form-table-wrap">
      <table className="portal-registration-form-table">
        <thead>
          <tr>
            <th scope="col">Course No.</th>
            <th scope="col">Course Title</th>
            <th scope="col">Units</th>
            <th scope="col">Day</th>
            <th scope="col">Time</th>
            <th scope="col">Track Ch/En</th>
            <th scope="col">Instructor</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((r, i) => (
            <tr key={`${r.courseNo}-${i}`}>
              <td>{r.courseNo}</td>
              <td>{r.courseTitle}</td>
              <td>{r.units}</td>
              <td>{r.day}</td>
              <td>{r.time}</td>
              <td>{r.trackChEn}</td>
              <td>{r.instructor}</td>
            </tr>
          ))}
          {Array.from({ length: emptySlots }, (_, i) => (
            <tr key={`empty-${i}`} className="portal-registration-form-table__empty">
              <td aria-hidden="true">&nbsp;</td>
              <td aria-hidden="true">&nbsp;</td>
              <td aria-hidden="true">&nbsp;</td>
              <td aria-hidden="true">&nbsp;</td>
              <td aria-hidden="true">&nbsp;</td>
              <td aria-hidden="true">&nbsp;</td>
              <td aria-hidden="true">&nbsp;</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>
              Total Units
            </th>
            <td colSpan={5}>{totalUnits}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
