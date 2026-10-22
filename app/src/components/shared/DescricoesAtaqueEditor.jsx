import React, { useState, useCallback } from 'react';
import { useFichaAtiva, useCallSaveAtivo } from '../Ficha Def/FichaAlvoContext';
import { novaDescricao, normalizarDescricoes, MARCADORES_DESCRICAO, MAX_DESCRICOES_POR_ITEM, MAX_CARACTERES_DESCRICAO } from '../../core/descricaoAtaque';

// 📖 "Como executo este ataque": uma ou mais descrições escritas pelo jogador pra uma técnica ou arma. Na hora do golpe o app
// usa uma delas (sorteia, se houver várias) e completa com o que estava ativo (core/descricaoAtaque.js). Grava direto no item da
// ficha em foco (a do jogador, ou a que o Mestre está vendo).
// colecao: 'poderes' | 'ataquesElementais' | 'inventario'
export default function DescricoesAtaqueEditor({ colecao, itemId }) {
    const { ficha, updateFicha } = useFichaAtiva();
    const callSave = useCallSaveAtivo();
    const [aberto, setAberto] = useState(false);

    const item = ((ficha && ficha[colecao]) || []).find(i => i && String(i.id) === String(itemId));
    const descricoes = normalizarDescricoes(item && item.descricoesAtaque, true);

    const gravar = useCallback((fn) => {
        updateFicha((f) => {
            const alvo = (f[colecao] || []).find(i => i && String(i.id) === String(itemId));
            if (!alvo) return;
            alvo.descricoesAtaque = fn(normalizarDescricoes(alvo.descricoesAtaque, true));
        });
        callSave();
    }, [updateFicha, callSave, colecao, itemId]);

    const adicionar = () => gravar(lista => (lista.length >= MAX_DESCRICOES_POR_ITEM ? lista : [...lista, novaDescricao('')]));
    const alterar = (id, texto) => gravar(lista => lista.map(d => (d.id === id ? { ...d, texto: texto.slice(0, MAX_CARACTERES_DESCRICAO) } : d)));
    const remover = (id) => gravar(lista => lista.filter(d => d.id !== id));

    if (!item) return null;
    const preenchidas = descricoes.filter(d => d.texto.trim() !== '').length;

    return (
        <div className="descricoes-ataque">
            <button type="button" className="descricoes-ataque-titulo" aria-expanded={aberto} onClick={() => setAberto(a => !a)}>
                📖 Como executo este ataque {preenchidas > 0 ? `(${preenchidas})` : ''} {aberto ? '▲' : '▼'}
            </button>
            {aberto && (
                <div className="descricoes-ataque-corpo">
                    <p className="descricoes-ataque-dica">
                        Escreva como o golpe é feito. Com várias descrições, uma é sorteada a cada ataque. Marcadores: {MARCADORES_DESCRICAO.join(' ')}. O app completa com o que está ativo (Formas, Poderes, elemento, energia, crítico).
                    </p>
                    {descricoes.map((d, i) => (
                        <div key={d.id} className="descricoes-ataque-linha">
                            <textarea
                                className="input-neon descricoes-ataque-texto"
                                rows={2}
                                maxLength={MAX_CARACTERES_DESCRICAO}
                                placeholder={`Descrição ${i + 1}: ex. {atacante} avança e golpeia {alvo} com {arma}...`}
                                value={d.texto}
                                onChange={e => alterar(d.id, e.target.value)}
                            />
                            <button type="button" className="descricoes-ataque-remover" title="Apagar esta descrição" aria-label={`Apagar a descrição ${i + 1}`} onClick={() => remover(d.id)}>✖</button>
                        </div>
                    ))}
                    {descricoes.length < MAX_DESCRICOES_POR_ITEM && (
                        <button type="button" className="descricoes-ataque-adicionar" onClick={adicionar}>+ {descricoes.length === 0 ? 'Escrever descrição' : 'Outra descrição'}</button>
                    )}
                </div>
            )}
        </div>
    );
}
