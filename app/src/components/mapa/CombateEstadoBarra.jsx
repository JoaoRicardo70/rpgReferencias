import React from 'react';

// ⚔️ Estado do combate da cena: "🕊️ Preparação" ou "⚔️ Combate · Rodada N". Só Mestre/Co-Mestre iniciam/encerram.
// Componente de apresentação: recebe os valores e callbacks do MapaFormContext (ou do resumo publicado na store).
export default function CombateEstadoBarra({ combateAtivo, rodadaAtual, combateSemInicio, isMestre, podeIniciar = true, onIniciar, onEncerrar }) {
    return (
        <div className="combate-estado-barra" data-testid="combate-estado-barra">
            <span
                className={`combate-estado-selo ${combateAtivo ? 'combate-estado-selo--ativo' : 'combate-estado-selo--preparacao'}`}
                role="status"
                aria-live="polite"
            >
                {combateAtivo ? `⚔️ Combate · Rodada ${rodadaAtual}` : '🕊️ Preparação'}
            </span>
            {isMestre && !combateAtivo && (
                <button type="button" className="btn-neon btn-green combate-estado-btn" onClick={onIniciar} disabled={!podeIniciar}
                    title={podeIniciar ? 'Inicia o combate desta cena: Rodada 1, o primeiro da ordem começa' : 'Coloque alguém na ordem de iniciativa primeiro'}>
                    ⚔️ Iniciar combate
                </button>
            )}
            {isMestre && combateAtivo && (
                <button type="button" className="btn-neon btn-red combate-estado-btn" onClick={onEncerrar} title="Encerra o combate desta cena e zera a ordem de iniciativa">
                    Encerrar combate
                </button>
            )}
            {isMestre && combateSemInicio && !combateAtivo && (
                <span className="combate-estado-aviso" role="note">Há combatentes na ordem mas o combate não foi iniciado.</span>
            )}
        </div>
    );
}
