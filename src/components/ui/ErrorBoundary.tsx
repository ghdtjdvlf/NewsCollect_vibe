'use client'

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  name?: string
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(`[ErrorBoundary:${this.props.name ?? 'unknown'}]`, error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="bg-white rounded-2xl border border-red-100 p-6 text-center">
            <p className="text-sm text-red-500 font-medium">문제가 발생했습니다</p>
            <p className="text-xs text-gray-400 mt-1">
              {this.state.error?.message ?? '잠시 후 다시 시도해주세요.'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="mt-3 text-xs text-indigo-500 underline"
            >
              다시 시도
            </button>
          </div>
        )
      )
    }
    return this.props.children
  }
}
