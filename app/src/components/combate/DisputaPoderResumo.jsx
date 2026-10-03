import React from 'react';
import useStore from '../../stores/useStore';
import { formatarFatorDisputa, formatarPoderDisputa } from '../../core/disputaPoder';
import { getPercepcaoPoder, enxergaEfetividade } from '../../core/percepcaoPoder';

// ⚖️ Prévia da Disputa de Poder (core/disputaPoder.js), reaproveitada no Ataque (contra uma
// entidade), na Defesa (Receber Dano) e no Dano Rápido do Mestre.
// Os números de Poder só aparecem pro Mestre: pros jogadores o Poder dos outros é estimado
// (core/percepcaoPoder.js), então a prévia mostra só o efeito (fator e diferença em %).
export default function DisputaPoderResumo({ disputa, nomeAtacante = 'Atacante', nomeDefensor = 'Alvo', semPoderTexto }) {
    const isMestre = useStore(s => s.isMestre);
    const minhaFicha = useStore(s => s.minhaFicha);
    if (!disputa) return null;
    if (!disputa.ativa) {
        return (
            <div className="disputa-poder disputa-poder--neutra">
                ⚖️ {semPoderTexto || 'Sem Disputa de Poder: um dos lados não tem Poder definido, o dano entra inteiro (x1).'}
            </div>
        );
    }
    // Sem Percepção de Poder o jogador nem sabe quem leva vantagem: só que a Disputa vale.
    if (!isMestre && !enxergaEfetividade(getPercepcaoPoder(minhaFicha))) {
        return (
            <div className="disputa-poder disputa-poder--neutra">
                ⚖️ Disputa de Poder em vigor: o dano que chega no alvo é ajustado pelo Poder dos dois lados (só o Mestre vê o recálculo).
            </div>
        );
    }
    const estado = disputa.fator <= 0 ? 'anulada' : (disputa.fator > 1 ? 'vantagem' : (disputa.fator < 1 ? 'desvantagem' : 'neutra'));
    const pct = Number.isFinite(disputa.diferenca) ? Math.round(disputa.diferenca * 100).toLocaleString('pt-BR') : '∞';
    return (
        <div className={`disputa-poder disputa-poder--${estado}`}>
            <div className="disputa-poder-linha">
                <span>⚖️ Disputa de Poder</span>
                <strong className="disputa-poder-fator">{disputa.fator <= 0 ? 'Sem efeito' : (isMestre ? `Dano x${formatarFatorDisputa(disputa.fator)}` : (disputa.fator > 1 ? 'Vantagem de Poder' : (disputa.fator < 1 ? 'Desvantagem de Poder' : 'Poder equilibrado')))}</strong>
            </div>
            <div className="disputa-poder-detalhe">
                {isMestre && <>{nomeAtacante} <strong>{formatarPoderDisputa(disputa.poderAtacante)}</strong> vs {nomeDefensor} <strong>{formatarPoderDisputa(disputa.poderDefensor)}</strong></>}
                {isMestre && disputa.fator !== 1 && <> · {disputa.atacanteMaisForte ? nomeAtacante : nomeDefensor} é {pct}% mais forte</>}
                {!isMestre && disputa.fator !== 1 && <>{disputa.atacanteMaisForte ? nomeAtacante : nomeDefensor} está em vantagem de Poder.</>}
                {!isMestre && disputa.fator === 1 && <>{nomeAtacante} e {nomeDefensor} estão em equilíbrio de Poder.</>}
            </div>
            {disputa.fator <= 0 && <div className="disputa-poder-detalhe">O alvo tem o dobro do Poder ou mais: este golpe não causa dano.</div>}
        </div>
    );
}
