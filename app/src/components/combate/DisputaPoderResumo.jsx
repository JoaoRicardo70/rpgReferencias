import React from 'react';
import { formatarFatorDisputa, formatarPoderDisputa } from '../../core/disputaPoder';

// ⚖️ Prévia da Disputa de Poder (core/disputaPoder.js), reaproveitada no Ataque (contra uma
// entidade), na Defesa (Receber Dano) e no Dano Rápido do Mestre.
export default function DisputaPoderResumo({ disputa, nomeAtacante = 'Atacante', nomeDefensor = 'Alvo', semPoderTexto }) {
    if (!disputa) return null;
    if (!disputa.ativa) {
        return (
            <div className="disputa-poder disputa-poder--neutra">
                ⚖️ {semPoderTexto || 'Sem Disputa de Poder: um dos lados não tem Poder definido, o dano entra inteiro (x1).'}
            </div>
        );
    }
    const estado = disputa.fator <= 0 ? 'anulada' : (disputa.fator > 1 ? 'vantagem' : (disputa.fator < 1 ? 'desvantagem' : 'neutra'));
    const pct = Number.isFinite(disputa.diferenca) ? Math.round(disputa.diferenca * 100).toLocaleString('pt-BR') : '∞';
    return (
        <div className={`disputa-poder disputa-poder--${estado}`}>
            <div className="disputa-poder-linha">
                <span>⚖️ Disputa de Poder</span>
                <strong className="disputa-poder-fator">{disputa.fator <= 0 ? 'Sem efeito' : `Dano x${formatarFatorDisputa(disputa.fator)}`}</strong>
            </div>
            <div className="disputa-poder-detalhe">
                {nomeAtacante} <strong>{formatarPoderDisputa(disputa.poderAtacante)}</strong> vs {nomeDefensor} <strong>{formatarPoderDisputa(disputa.poderDefensor)}</strong>
                {disputa.fator !== 1 && <> · {disputa.atacanteMaisForte ? nomeAtacante : nomeDefensor} é {pct}% mais forte</>}
            </div>
            {disputa.fator <= 0 && <div className="disputa-poder-detalhe">O alvo tem o dobro do Poder ou mais: este golpe não causa dano.</div>}
        </div>
    );
}
