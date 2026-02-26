import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Firebase Functions 환경에서는 Application Default Credentials 자동 사용
if (getApps().length === 0) {
  initializeApp()
}

export const db = getFirestore()
