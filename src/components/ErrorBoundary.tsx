import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in CryptoDUST:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-[#0a0a12] text-white flex items-center justify-center p-8">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-semibold mb-4 text-red-400">Something went wrong</h1>
            <p className="text-[#9ca3af] mb-6">
              CryptoDUST encountered an unexpected error. Please refresh the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl border border-white/20 transition-colors"
            >
              Reload App
            </button>
            {this.state.error && (
              <pre className="mt-6 text-left text-xs text-red-400/70 overflow-auto p-3 bg-black/30 rounded">
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
