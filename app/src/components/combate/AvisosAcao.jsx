import React, { useEffect } from 'react';
import useStore from '../../stores/useStore';

// ⏱️ Avisos curtos (toasts) sobre Ações e Reações: "Gastou 1 Reação (restam 1)", "Suas Reações acabaram", etc.
// Quem quer avisar chama useStore.getState().adicionarAviso(texto, 'info' | 'alerta'); cada aviso some sozinho.
const DURACAO_MS = 4500;

function Aviso({ aviso }) {
    const removerAviso = useStore(s => s.removerAviso);
    useEffect(() => {
        const id = setTimeout(() => removerAviso(aviso.id), DURACAO_MS);
        return () => clearTimeout(id);
    }, [aviso.id, removerAviso]);
    return (
        <div className={`aviso-acao aviso-acao-${aviso.tipo === 'alerta' ? 'alerta' : 'info'}`} role="status" onClick={() => removerAviso(aviso.id)}>
            {aviso.tipo === 'alerta' ? '⚠️' : '⏱️'} {aviso.texto}
        </div>
    );
}

export default function AvisosAcao() {
    const avisos = useStore(s => s.avisosAcao);
    if (!avisos || avisos.length === 0) return null;
    return (
        <div className="avisos-acao" aria-live="polite">
            {avisos.map(a => <Aviso key={a.id} aviso={a} />)}
        </div>
    );
}
