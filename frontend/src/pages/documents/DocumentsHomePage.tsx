import { useState } from 'react'
import { AgreementsSection } from './components/AgreementsSection'
import { DocumentsTabs, type DocumentsTabId } from './components/DocumentsTabs'
import { QuizSection } from './components/QuizSection'
import { RegistrationFormsSection } from './components/RegistrationFormsSection'

export function DocumentsHomePage() {
  const [tab, setTab] = useState<DocumentsTabId>('registration')

  return (
    <main className="portal-page portal-documents-home">
      <DocumentsTabs active={tab} onChange={setTab} />
      <div className="portal-documents-home__panel">
        {tab === 'registration' ? <RegistrationFormsSection /> : null}
        {tab === 'quiz' ? <QuizSection /> : null}
        {tab === 'agreements' ? <AgreementsSection /> : null}
      </div>
    </main>
  )
}
