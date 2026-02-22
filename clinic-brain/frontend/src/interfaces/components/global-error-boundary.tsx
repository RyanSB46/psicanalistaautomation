import { Component, type ErrorInfo, type ReactNode } from 'react'

type GlobalErrorBoundaryProps = {
  children: ReactNode
}

type GlobalErrorBoundaryState = {
  hasError: boolean
  message: string
}

export class GlobalErrorBoundary extends Component<GlobalErrorBoundaryProps, GlobalErrorBoundaryState> {
  state: GlobalErrorBoundaryState = {
    hasError: false,
    message: '',
  }

  static getDerivedStateFromError(error: unknown): GlobalErrorBoundaryState {
    const message = error instanceof Error ? error.message : 'Erro inesperado no frontend.'
    return {
      hasError: true,
      message,
    }
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error('Erro de renderização capturado:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="login-root">
          <div className="card login-card state-box state-box-error">
            <h3>O frontend encontrou um erro</h3>
            <p>{this.state.message || 'Falha ao renderizar a aplicação.'}</p>
            <button type="button" className="secondary-button" onClick={() => window.location.reload()}>
              Recarregar página
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
