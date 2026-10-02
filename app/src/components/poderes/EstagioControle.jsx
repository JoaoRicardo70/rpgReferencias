import React, { useState, useEffect } from 'react';
import { temEstagios, getEstagioAtual, getMaximoEstagio, limitarEstagio, nomeDoEstagio, fatorDoEstagio, marcoVigente, fadigaPorTurnoDoEstagio } from '../../core/estagios';

const fmtFator = (v) => (Math.round(v * 100) / 100).toLocaleString('pt-BR');

// 🪜 Seletor de estágio de uma técnica com Estágios (core/estagios.js) — usado no card do Livro dos
// Poderes (completo) e nas Técnicas Rápidas do Mapa (compacto). `onMudar(id, novoEstagio)` é o
// mudarEstagioPoder de PoderesFormContext.
export default function EstagioControle({ poder, onMudar, compacto = false }) {
    const atual = getEstagioAtual(poder);
    const [digitado, setDigitado] = useState(String(atual));
    useEffect(() => { setDigitado(String(atual)); }, [atual]);

    if (!temEstagios(poder) || !onMudar) return null;

    const max = getMaximoEstagio(poder);
    const semLimite = max === Infinity;
    const nome = nomeDoEstagio(poder, atual);
    const fator = fatorDoEstagio(poder, atual);
    const inicioRegra = marcoVigente(poder, atual).estagio;
    const fadiga = fadigaPorTurnoDoEstagio(poder, atual);

    // Acima do último estágio vai pro último; o campo sempre volta a mostrar o estágio real.
    const irPara = () => {
        const n = parseInt(digitado, 10);
        const alvo = Number.isFinite(n) ? limitarEstagio(poder, n) : atual;
        if (alvo !== atual) onMudar(poder.id, alvo);
        setDigitado(String(alvo));
    };

    return (
        <div className={`estagio-controle${compacto ? ' compacto' : ''}${poder.ativa ? ' ativa' : ''}`}>
            <button
                type="button"
                className="estagio-btn"
                onClick={() => onMudar(poder.id, atual - 1)}
                disabled={atual <= 1}
                aria-label={`Descer para o estágio ${atual - 1}`}
                title="Descer um estágio"
            >−</button>
            <div className="estagio-info" title={nome.completo}>
                <span className="estagio-nome">
                    🪜 {nome.curto}{semLimite ? '' : ` / ${max}`}
                </span>
                {!compacto && nome.proprio && <span className="estagio-proprio">{nome.proprio}</span>}
                {!compacto && (
                    <span className="estagio-detalhe">
                        {inicioRegra > 1 ? `✦ Efeitos do ${inicioRegra}º` : 'Efeitos'} x{fmtFator(fator)} · 😮‍💨 {fmtFator(fadiga)}% Fadiga/turno{semLimite ? ' · ∞ sem limite' : ''}
                    </span>
                )}
            </div>
            <button
                type="button"
                className="estagio-btn"
                onClick={() => onMudar(poder.id, atual + 1)}
                disabled={atual >= max}
                aria-label={`Subir para o estágio ${atual + 1}`}
                title="Subir um estágio"
            >+</button>
            {!compacto && (
                <input
                    type="number"
                    min="1"
                    max={semLimite ? undefined : max}
                    className="estagio-ir"
                    value={digitado}
                    onChange={e => setDigitado(e.target.value)}
                    onBlur={irPara}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    aria-label="Ir direto para o estágio"
                    title="Ir direto para o estágio"
                />
            )}
        </div>
    );
}
