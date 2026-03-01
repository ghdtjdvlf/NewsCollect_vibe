import 'server-only'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function initFirebase() {
  if (getApps().length > 0) return getApps()[0]

  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  })
}

const isNew = getApps().length === 0
initFirebase()
export const db = getFirestore()
// settings()는 첫 초기화 시에만 호출 가능 (dev 핫리로드 중복 호출 방지)
if (isNew) {
  db.settings({ ignoreUndefinedProperties: true })
}
