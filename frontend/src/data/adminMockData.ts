export type AdminStudentRow = {
  studentId: string
  name: string
  program: string
  status: string
  email: string
  balance: string
}

export const MOCK_ADMIN_STUDENTS: AdminStudentRow[] = [
  {
    studentId: 'AMU-10042',
    name: 'Chen, Michael',
    program: 'Doctor of Acupuncture',
    status: 'Active',
    email: 'mchen@student.amu.edu',
    balance: '$2,450.00',
  },
  {
    studentId: 'AMU-10108',
    name: 'Patel, Priya',
    program: 'MS Traditional Chinese Medicine',
    status: 'Active',
    email: 'ppatel@student.amu.edu',
    balance: '$0.00',
  },
  {
    studentId: 'AMU-09991',
    name: 'Nguyen, David',
    program: 'Doctor of Acupuncture',
    status: 'Leave',
    email: 'dnguyen@student.amu.edu',
    balance: '$890.50',
  },
]

export type AdminCourseRow = {
  code: string
  title: string
  credits: number
  category: string
  status: string
}

export const MOCK_ADMIN_COURSES: AdminCourseRow[] = [
  {
    code: 'ACM 501',
    title: 'Foundations of Chinese Medicine',
    credits: 3,
    category: 'Didactic',
    status: 'Active',
  },
  {
    code: 'ACM 610',
    title: 'Clinical Observation I',
    credits: 2,
    category: 'Clinical',
    status: 'Active',
  },
  {
    code: 'BMS 420',
    title: 'Human Anatomy & Physiology',
    credits: 4,
    category: 'Biomedical',
    status: 'Scheduled',
  },
]
