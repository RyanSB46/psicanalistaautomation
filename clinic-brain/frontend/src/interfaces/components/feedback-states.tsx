type ErrorStateProps = {
  title?: string
  message: string
  onRetry?: () => void
}

export function LoadingState({ message }: { message?: string }) {
  return <div className="state-box">{message ?? 'Carregando...'}</div>
}

export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  return (
    <div className="state-box state-box-error">
      <h3>{title ?? 'Erro ao carregar dados'}</h3>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="secondary-button" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return <div className="state-box">{message}</div>
}
