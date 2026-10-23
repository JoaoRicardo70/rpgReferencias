import React, { useCallback } from 'react';
import useStore from '../../stores/useStore';
import { salvarCenarioCompleto } from '../../services/firebase-sync';
import { getLimitePadraoSegurar } from '../../core/segurarAcao';
import { ACOES_MAXIMO } from '../../core/acoes';

// ⏳ Padrão da mesa para "Segurar Ação" (Hold Action): quantas Ações cada personagem pode segurar ao mesmo tempo.
// 0 desliga a regra. O Mestre ainda pode dar um limite próprio a um personagem (no quadro Segurar Ação da ficha dele).
export default function MestreSegurarAcao() {
    const cenario = useStore(s => s.cenario);
    const setCenario = useStore(s => s.setCenario);
    const limite = getLimitePadraoSegurar(cenario);

    const mudar = useCallback((valor) => {
        // Campo vazio (apagando pra digitar) ou cenário ainda não carregado: não grava.
        if (valor === '' || !cenario) return;
        const n = Math.max(0, Math.min(ACOES_MAXIMO, Math.trunc(Number(valor)) || 0));
        const novo = JSON.parse(JSON.stringify(cenario || {}));
        novo.segurarAcaoMax = n;
        setCenario(novo);
        salvarCenarioCompleto(novo);
    }, [cenario, setCenario]);

    return (
        <div className="mestre-segurar-acao">
            <h3 className="mestre-segurar-acao-titulo">⏳ Segurar Ação</h3>
            <label className="mestre-segurar-acao-campo">
                Ações que cada personagem pode segurar
                <input className="input-neon mestre-segurar-acao-input" type="number" min="0" max={ACOES_MAXIMO} value={limite} onChange={e => mudar(e.target.value)} aria-label="Máximo de Ações seguradas por personagem" />
            </label>
            <p className="mestre-segurar-acao-dica">0 desliga a regra. Segurar gasta 1 Ação do turno e vale até o começo do próximo turno de quem segurou.</p>
        </div>
    );
}
