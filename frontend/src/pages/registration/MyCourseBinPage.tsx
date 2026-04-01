import { useNavigate } from 'react-router-dom'
import { useCourseBin, type CourseBinItem } from './CourseBinContext'

function binRowKey(item: CourseBinItem): string {
  return `${item.course_code.trim().toLowerCase()}|${item.section.trim().toLowerCase()}`
}

export function MyCourseBinPage() {
  const navigate = useNavigate()
  const { items, removeFromCourseBin } = useCourseBin()
  const hasItems = items.length > 0

  const handleCheckout = () => {
    navigate('/finances/overview')
  }

  return (
    <main className="portal-page portal-course-bin-page">
      <section className="portal-card portal-stack" aria-labelledby="course-bin-heading">
        <div className="portal-course-bin-card-header">
          <div className="portal-course-bin-card-header-text">
            <h2 id="course-bin-heading" className="portal-section-heading">
              My CourseBin
            </h2>
            <p className="portal-page-lede portal-course-bin-lede">
              Sections you add from Course Search appear here before registration is finalized.
            </p>
          </div>
          <div className="portal-course-bin-card-header-actions">
            <button
              type="button"
              className="portal-btn portal-btn--primary portal-btn--compact"
              disabled={!hasItems}
              onClick={handleCheckout}
            >
              Checkout
            </button>
          </div>
        </div>

        <div className="portal-course-search-sections-table-wrap portal-course-search-sections-table-wrap--schedule">
          <div className="portal-course-search-sections-table-scroll">
            <table className="portal-table portal-table--course-sections portal-table--course-section-schedule portal-table--course-bin">
              <caption className="visually-hidden">
                Courses and sections currently in your CourseBin
              </caption>
              <thead>
                <tr>
                  <th scope="col">Course</th>
                  <th scope="col">Section</th>
                  <th scope="col">Session</th>
                  <th scope="col">Type</th>
                  <th scope="col">Units</th>
                  <th scope="col">Registered</th>
                  <th scope="col">Time</th>
                  <th scope="col">Days</th>
                  <th scope="col">Instructor</th>
                  <th scope="col">Location</th>
                  <th scope="col" className="portal-course-section-schedule-col-action">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={binRowKey(item)}>
                    <td>
                      <div className="portal-course-bin-course-cell">
                        <span className="portal-course-bin-course-code">{item.course_code.trim() || '—'}</span>
                        <span className="portal-course-bin-course-title">
                          {item.eng_name.trim() || '—'}
                        </span>
                      </div>
                    </td>
                    <td>{item.section}</td>
                    <td>{item.session}</td>
                    <td>{item.type}</td>
                    <td>{item.units}</td>
                    <td>{item.registered}</td>
                    <td>{item.time}</td>
                    <td>{item.days}</td>
                    <td>{item.instructor}</td>
                    <td>{item.location}</td>
                    <td className="portal-course-section-schedule-col-action">
                      <button
                        type="button"
                        className="portal-btn portal-btn--course-search-bin"
                        onClick={() => removeFromCourseBin(item.course_code, item.section)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}
