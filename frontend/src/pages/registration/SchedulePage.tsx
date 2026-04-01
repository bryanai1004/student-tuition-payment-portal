const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
const SLOTS = ['8:00', '10:00', '12:00', '2:00', '4:00'] as const

export function SchedulePage() {
  return (
    <main className="portal-page">
      <section className="portal-card portal-stack" aria-labelledby="timetable-heading">
        <h2 id="timetable-heading" className="portal-section-heading">
          My Timetable
        </h2>
        <div className="portal-table-wrap">
          <table className="portal-table portal-table--courses">
            <caption className="visually-hidden">Weekly class schedule placeholder</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                {DAYS.map((d) => (
                  <th key={d} scope="col">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SLOTS.map((time) => (
                <tr key={time}>
                  <th scope="row">{time}</th>
                  {DAYS.map((d) => (
                    <td key={d}>—</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
