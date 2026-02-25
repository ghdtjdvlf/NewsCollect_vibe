import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 text-center">
      <span className="text-5xl mb-4">📰</span>
      <h2 className="text-lg font-bold text-gray-900 mb-2">뉴스를 찾을 수 없습니다</h2>
      <p className="text-sm text-gray-400 mb-6">삭제되었거나 주소가 잘못되었습니다.</p>
      <Link
        href="/"
        className="px-5 py-2.5 bg-indigo-500 text-white text-sm font-medium rounded-full"
      >
        홈으로 돌아가기
      </Link>
    </div>
  )
}
