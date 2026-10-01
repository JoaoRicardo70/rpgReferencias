import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import LimiteDeErro from './components/layout/LimiteDeErro'
import '../css/styles.css'

// 👇 INJEÇÃO DO PWA (A Ignição do Motor) 👇
import { registerSW } from 'virtual:pwa-register'
registerSW({ immediate: true })

const LazyPlasmicHostPage = React.lazy(() => import('./plasmic-host'))

function RootRouter() {
  const isPlasmic = window.location.pathname === '/plasmic-host'

  if (isPlasmic) {
    return (
      <React.Suspense fallback={<div>Carregando Plasmic...</div>}>
        <LazyPlasmicHostPage />
      </React.Suspense>
    )
  }

  return <App />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Última camada: se algo fora das abas quebrar, aparece o aviso em vez da tela branca. */}
    <LimiteDeErro area="O sistema">
      <RootRouter />
    </LimiteDeErro>
  </React.StrictMode>
)