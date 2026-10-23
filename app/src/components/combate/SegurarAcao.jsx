import React, { useState, useCallback } from 'react';
import useStore from '../../stores/useStore';
import { useFichaAtiva, useCallSaveAtivo } from '../Ficha Def/FichaAlvoContext';
import { enviarParaFeed } from '../../services/firebase-sync';
import { getAcoesSeguradas, getLimiteSegurar, getLimitePadraoSegurar, podeSegurarAcao, segurarAcao, usarAcaoSegurada, soltarAcaoSegurada } from '../../core/segurarAcao';
import { getCreditoAcaoSegurada } from '../../core/acoes';

// ⏳ SEGURAR AÇÃO (Hold Action): guarda uma Ação do turno para usar depois, quando o gatilho anotado acontecer
// (core/segurarAcao.js). O Mestre define quantas Ações cada um pode segurar (padrão da mesa na aba Mestre; aqui ele ainda
// pode dar um limite próprio a este personagem). Age sobre a ficha em foco (a do jogador ou a que o Mestre está vendo).
export default function SegurarAcao() {
    const { ficha, updateFicha, nome } = useFichaAtiva();
    const salvar = useCallSaveAtivo();
    const cenario = useStore(s => s.cenario);
    const isMestre = useStore(s => s.isMestre);
    const adicionarAviso = useStore(s => s.adicionarAviso);
    const [gatilho, setGatilho] = useState('');

    const limite = getLimiteSegurar(ficha, cenario);
    const seguradas = getAcoesSeguradas(ficha);
    const credito = getCreditoAcaoSegurada(ficha);

    const avisoFeed = useCallback((texto) => {
        enviarParaFeed({ tipo: 'sistema', nome: nome || '', texto, ts: Date.now() });
    }, [nome]);

    const segurar = useCallback(() => {
        const pode = podeSegurarAcao(ficha, limite);
        if (!pode.ok) { adicionarAviso?.(pode.motivo, 'alerta'); return; }
        const texto = gatilho.trim();
        let resultado = { ok: false };
        updateFicha(f => { resultado = segurarAcao(f, texto, limite); });
        if (!resultado.ok) { adicionarAviso?.(resultado.motivo || 'Não foi possível segurar a Ação.', 'alerta'); return; }
        salvar();
        avisoFeed(`⏳ ${nome} segura uma Ação${texto ? ` (gatilho: ${texto})` : ''}.`);
        setGatilho('');
    }, [ficha, limite, gatilho, updateFicha, salvar, avisoFeed, adicionarAviso, nome]);

    const usar = useCallback((entrada) => {
        updateFicha(f => { usarAcaoSegurada(f, entrada.id); });
        salvar();
        avisoFeed(`▶️ ${nome} usa a Ação segurada${entrada.gatilho ? ` (gatilho: ${entrada.gatilho})` : ''}.`);
        adicionarAviso?.('Ação segurada em uso: a sua próxima Ação sai dela, sem gastar do turno.', 'info');
    }, [updateFicha, salvar, avisoFeed, adicionarAviso, nome]);

    const soltar = useCallback((entrada) => {
        updateFicha(f => { soltarAcaoSegurada(f, entrada.id); });
        salvar();
        avisoFeed(`↩️ ${nome} desistiu de segurar a Ação.`);
    }, [updateFicha, salvar, avisoFeed, nome]);

    const mudarLimitePersonagem = useCallback((valor) => {
        updateFicha(f => { if (!f.combate) f.combate = {}; f.combate.segurarAcaoMax = valor === '' ? '' : Math.max(0, Math.min(5, Math.trunc(Number(valor)) || 0)); });
        salvar();
    }, [updateFicha, salvar]);

    if (!ficha) return null;
    const desligado = limite <= 0;

    return (
        <div className="segurar-acao">
            <div className="segurar-acao-cabecalho">
                <strong className="segurar-acao-titulo">⏳ Segurar Ação</strong>
                <span className="segurar-acao-contagem" title="Ações seguradas / máximo que o Mestre permite">{seguradas.length}/{limite}</span>
                {credito > 0 && <span className="segurar-acao-credito" title="A próxima Ação que você gastar sai da Ação segurada">▶️ em uso</span>}
            </div>

            {desligado && seguradas.length === 0 && <p className="segurar-acao-dica">O Mestre não liberou segurar Ação para este personagem.</p>}

            {seguradas.length > 0 && (
                <ul className="segurar-acao-lista">
                    {seguradas.map(a => (
                        <li key={a.id} className="segurar-acao-item">
                            <span className="segurar-acao-gatilho">{a.gatilho ? `Quando: ${a.gatilho}` : 'Sem gatilho anotado'}</span>
                            <button type="button" className="btn-neon segurar-acao-botao" onClick={() => usar(a)}>▶ Usar</button>
                            <button type="button" className="segurar-acao-soltar" onClick={() => soltar(a)} title="Desistir de segurar e devolver a Ação">✕</button>
                        </li>
                    ))}
                </ul>
            )}

            {!desligado && (
                <div className="segurar-acao-form">
                    <input
                        className="input-neon segurar-acao-input" type="text" maxLength={160} value={gatilho}
                        onChange={e => setGatilho(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') segurar(); }}
                        placeholder="Esperando o quê? (ex.: o inimigo sair da cobertura)"
                        aria-label="Gatilho da Ação segurada"
                    />
                    <button type="button" className="btn-neon segurar-acao-botao" onClick={segurar} disabled={seguradas.length >= limite}>⏳ Segurar</button>
                </div>
            )}
            <p className="segurar-acao-dica">Segurar gasta 1 Ação do turno. A Ação segurada vale até o começo do seu próximo turno.</p>

            {isMestre && (
                <label className="segurar-acao-mestre">
                    👑 Limite deste personagem
                    <input
                        className="input-neon segurar-acao-limite" type="number" min="0" max="5"
                        value={ficha.combate?.segurarAcaoMax ?? ''} placeholder={`mesa: ${getLimitePadraoSegurar(cenario)}`}
                        onChange={e => mudarLimitePersonagem(e.target.value)}
                    />
                </label>
            )}
        </div>
    );
}
