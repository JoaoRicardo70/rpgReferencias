import React from 'react'
import useStore from '../../stores/useStore'
import LimiteDeErro from './LimiteDeErro'

// descarregarAoSair: a aba só existe enquanto está na tela (o padrão continua sendo mantê-la montada e escondida).
// sempreVisivel: continua na tela mesmo sem ser a aba ativa (modo Mesa: o Mapa fica ao fundo, as outras abas abrem num painel ao lado).
export default function TabPanel({ className, id, children, descarregarAoSair = false, sempreVisivel = false }) {
    const abaAtiva = useStore(s => s.abaAtiva)
    if (descarregarAoSair && abaAtiva !== id) return null
    
    // O segredo: se não for a aba ativa, escondemos com display: none, 
    // mas MANTEMOS o HTML lá para o app.js antigo não quebrar!
    const estilo = {
        display: (abaAtiva === id || sempreVisivel) ? 'block' : 'none',
        height: '100%',
        width: '100%'
    }

    return (
        <div id={id} className={['glass-panel', className].filter(Boolean).join(' ')} style={estilo}>
            {/* Se esta aba quebrar, só ela mostra o aviso; voltar pra ela tenta desenhar de novo. */}
            <LimiteDeErro area="Esta aba" chaveReset={abaAtiva === id}>
                {children}
            </LimiteDeErro>
        </div>
    )
}