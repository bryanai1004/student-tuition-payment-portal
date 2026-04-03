import type { RegistrationClinicRow } from '../../../lib/registrationFormAdapter'

type Props = {
  rows: RegistrationClinicRow[]
  totalHours: number
}

export function RegistrationClinicTable({ rows, totalHours }: Props) {
  const displayRows = rows.length > 0 ? rows : []
  const padRows = 4
  const emptySlots = Math.max(0, padRows - displayRows.length)

  return (
    <div className="portal-registration-form-table-wrap">
      <table className="portal-registration-form-table">
        <thead>
          <tr>
            <th scope="col">Course No.</th>
            <th scope="col">Clinic Course Title</th>
            <th scope="col">Hours</th>
            <th scope="col">Day</th>
            <th scope="col">Time</th>
            <th scope="col">Supervisor&apos;s Name</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((r, i) => (
            <tr key={`${r.courseNo}-clinic-${i}`}>
              <td>{r.courseNo}</td>
              <td>{r.clinicCourseTitle}</td>
              <td>{r.hours}</td>
              <td>{r.day}</td>
              <td>{r.time}</td>
              <td>{r.supervisorName}</td>
            </tr>
          ))}
          {Array.from({ length: emptySlots }, (_, i) => (
            <tr key={`c-empty-${i}`} className="portal-registration-form-table__empty">
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
              Total Hours
            </th>
            <td colSpan={4}>{totalHours}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
