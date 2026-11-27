import React, { useCallback, useState } from 'react';
import { definirVisibilidadeRaca } from '../../services/composicaoRacial';
import { nivelDaRaca, niveisParaEditor, ROTULOS, DESCRICOES } from '../../core/racasVisibilidade';

// 🙈 Seletor de visibilidade de UMA Raça (core/racasVisibilidade.js). Dono jogador: Pública/Privada. Mestre/Co-Mestre: Pública/Privada/Secreta + "👁️ Revelar".
// `chave` = id da Raça no catálogo ou '_principal'. `entidade` = { id, nome } do dono da ficha. Quem grava (e recusa o que não pode) é o serviço.
export default function SeletorVisibilidadeRaca({ entidade, chave, ficha, souMestre = false, nomeRaca = 'Raça' }) {
    const [erro, setErro] = useState('');
    const nivel = nivelDaRaca(ficha, chave);
    const mudar = useCallback((novo) => {
        const r = definirVisibilidadeRaca(entidade, chave, novo);
        setErro(r.ok ? '' : (r.mensagem || 'Não foi possível mudar a visibilidade.'));
    }, [entidade, chave]);
    const opcoes = niveisParaEditor(souMestre);
    return (
        <span className="visibilidade-raca">
            <select className="input-neon visibilidade-raca-select" value={nivel} aria-label={`Visibilidade de ${nomeRaca}`} title={DESCRICOES[nivel]}
                onChange={(ev) => mudar(ev.target.value)}>
                {(opcoes.includes(nivel) ? opcoes : [nivel, ...opcoes]).map(n => <option key={n} value={n}>{ROTULOS[n]}</option>)}
            </select>
            {souMestre && nivel !== 'publica' && (
                <button type="button" className="btn-neon equipes-btn visibilidade-raca-revelar" aria-label={`Revelar ${nomeRaca}`} onClick={() => mudar('publica')}>👁️ Revelar</button>
            )}
            {erro && <span className="visibilidade-raca-erro" role="alert">{erro}</span>}
        </span>
    );
}
