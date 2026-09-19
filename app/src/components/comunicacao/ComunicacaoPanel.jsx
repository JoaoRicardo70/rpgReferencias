import React from 'react';
import useStore from '../../stores/useStore';
import { PainelComunicacao } from './DockComunicacao';

// Aba dedicada à comunicação (chats + Sala da Party). O estado de voz e de chat vive nos provedores
// globais do App, então tudo continua funcionando (inclusive o áudio) quando o usuário troca de aba.
// O painel só é desenhado com a aba visível: assim as mensagens só contam como lidas quando você as vê.
export default function ComunicacaoPanel() {
    const abaAtiva = useStore(s => s.abaAtiva);
    if (abaAtiva !== 'aba-comunicacao') return null;
    return (
        <div className="comunicacao-aba">
            <h2 className="comunicacao-aba-titulo">💬 Comunicação</h2>
            <PainelComunicacao className="painel-com-aba" />
        </div>
    );
}
