import React, { useState, useCallback } from 'react';
import { ATRIBUTOS_AGRUPADOS, getPropriedadesDoAtributo } from '../../core/efeitos-constants';
import { normalizarBuff, descreverBuff, LIMITES } from '../../core/combos';

// Lista de buffs (os mesmos efeitos das Habilidades/Poderes: atributo + propriedade + valor) de um golpe ou de um nível de Follow Up.
export default function EditorBuffs({ buffs, onChange, rotulo = 'Buffs' }) {
    const [atributo, setAtributo] = useState('dano');
    const [propriedade, setPropriedade] = useState('base');
    const [valor, setValor] = useState('');
    const propriedades = getPropriedadesDoAtributo(atributo);

    const trocarAtributo = useCallback((novo) => {
        setAtributo(novo);
        const opcoes = getPropriedadesDoAtributo(novo);
        setPropriedade((atual) => (opcoes.includes(atual) ? atual : opcoes[0]));
    }, []);

    const adicionar = useCallback(() => {
        const novo = normalizarBuff({ atributo, propriedade, valor });
        if (!novo || buffs.length >= LIMITES.buffs) return;
        onChange([...buffs, novo]);
        setValor('');
    }, [atributo, propriedade, valor, buffs, onChange]);

    return (
        <div className="combo-buffs">
            <span className="combo-rotulo">{rotulo}</span>
            {buffs.length === 0 && <span className="combo-vazio">Nenhum buff.</span>}
            {buffs.map((b, i) => (
                <div key={`${b.atributo}-${b.propriedade}-${i}`} className="combo-buff">
                    <span>{descreverBuff(b)}</span>
                    <button type="button" className="combo-mini" aria-label={`Remover buff ${descreverBuff(b)}`} onClick={() => onChange(buffs.filter((_, j) => j !== i))}>✕</button>
                </div>
            ))}
            <div className="combo-buff-novo">
                <select className="input-neon" aria-label="Atributo do buff" value={atributo} onChange={(e) => trocarAtributo(e.target.value)}>
                    {ATRIBUTOS_AGRUPADOS.map(g => (
                        <optgroup key={g.label} label={g.label}>{g.options.map(o => <option key={o} value={o}>{o}</option>)}</optgroup>
                    ))}
                </select>
                <select className="input-neon" aria-label="Propriedade do buff" value={propriedade} onChange={(e) => setPropriedade(e.target.value)}>
                    {propriedades.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <input className="input-neon" type="number" step="any" aria-label="Valor do buff" placeholder="valor" value={valor} onChange={(e) => setValor(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') adicionar(); }} />
                <button type="button" className="btn-neon combo-mini-botao" onClick={adicionar} disabled={valor === '' || buffs.length >= LIMITES.buffs}>➕ Buff</button>
            </div>
        </div>
    );
}
