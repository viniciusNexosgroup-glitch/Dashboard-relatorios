'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[dashboard error]', error)
  }, [error])

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center max-w-md">
        <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-800">Erro ao carregar a página</h2>
        <p className="text-sm text-gray-500 mt-2">{error.message}</p>
        {error.digest && (
          <p className="text-xs text-gray-400 mt-1 font-mono">digest: {error.digest}</p>
        )}
        <button
          onClick={() => unstable_retry()}
          className="mt-5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  )
}
