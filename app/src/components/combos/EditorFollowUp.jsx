import React, { useCallback } from 'react';
import { ACOES_GOLPE, QUANDO_FOLLOW_UP, LIMITES } from '../../core/combos';
import EditorGolpe from './EditorGolpe';
import EditorBuffs from './EditorBuffs';

// Editor de um Follow Up: o golpe, quando pode ser usado, com que Ação (pode ser fora do turno) e os NÍVEIS de buff
// (cada nível vale a partir de N Combos finalizados no combate).
export default function EditorFollowUp({ followUp, combos, onChange, onSalvar, onCancelar, ficha }) {
    const alternar = useCallback((campo, valor) => {
        const lista = followUp[campo];
        onChange({ ...followUp, [campo]: lista.includes(valor) ? lista.filter(x => x !== valor) : [...lista, valor] });
    }, [followUp, onChange]);
    const mudarNivel = useCallback((i, campos) => onChange({ ...followUp, niveis: followUp.niveis.map((n, j) => (j === i ? { ...n, ...campos } : n)) }), [followUp, onChange]);
    const podeSalvar = followUp.nome.trim() && followUp.acoesPermitidas.length > 0;

    return (
        <div className="combo-editor" role="group" aria-label="Editor de Follow Up">
            <EditorGolpe golpe={followUp} onChange={(g) => onChange({ ...followUp, ...g })} ficha={ficha} titulo="Golpe do Follow Up" comBuffs={false} />
            <label className="combo-campo">Quando pode ser usado
                <select className="input-neon" value={followUp.quando} onChange={(e) => onChange({ ...followUp, quando: e.target.value })}>
                    {QUANDO_FOLLOW_UP.map(q => <option key={q.id} value={q.id}>{q.rotulo}</option>)}
                </select>
            </label>
            {followUp.quando === 'combo' && combos.length > 0 && (
                <fieldset className="combo-fieldset">
                    <legend>Em quais Combos (nenhum marcado = em todos)</legend>
                    {combos.map(c => (
                        <label key={c.id}><input type="checkbox" checked={followUp.combosIds.includes(c.id)} onChange={() => alternar('combosIds', c.id)} /> {c.nome}</label>
                    ))}
                </fieldset>
            )}
            <fieldset className="combo-fieldset">
                <legend>Pode ser pago com (fora do turno também)</legend>
                {ACOES_GOLPE.map(a => (
                    <label key={a.id}><input type="checkbox" checked={followUp.acoesPermitidas.includes(a.id)} onChange={() => alternar('acoesPermitidas', a.id)} /> {a.id === 'padrao' ? 'Ação (segurada)' : a.rotulo}</label>
                ))}
            </fieldset>
            <span className="combo-rotulo">Níveis de buff</span>
            {followUp.niveis.map((nivel, i) => (
                <div key={i} className="combo-passo">
                    <div className="combo-passo-topo">
                        <strong>Nível {i + 1}</strong>
                        <button type="button" className="combo-mini" aria-label={`Remover o nível ${i + 1}`} disabled={followUp.niveis.length <= 1} onClick={() => onChange({ ...followUp, niveis: followUp.niveis.filter((_, j) => j !== i) })}>🗑</button>
                    </div>
                    <label className="combo-campo">Vale a partir de
                        <input className="input-neon" type="number" min="0" aria-label={`Combos finalizados para o nível ${i + 1}`} value={nivel.combos} onChange={(e) => mudarNivel(i, { combos: Math.max(0, parseInt(e.target.value, 10) || 0) })} /> Combos finalizados
                    </label>
                    <EditorBuffs buffs={nivel.buffs} onChange={(buffs) => mudarNivel(i, { buffs })} rotulo="Buffs deste nível" />
                </div>
            ))}
            <button type="button" className="btn-neon" disabled={followUp.niveis.length >= LIMITES.niveis} onClick={() => onChange({ ...followUp, niveis: [...followUp.niveis, { combos: (followUp.niveis[followUp.niveis.length - 1]?.combos || 0) + 1, descricao: '', buffs: [] }] })}>➕ Adicionar nível</button>
            <div className="combo-acoes">
                <button type="button" className="btn-neon" onClick={onSalvar} disabled={!podeSalvar}>✅ Salvar Follow Up</button>
                <button type="button" className="btn-neon combo-cancelar" onClick={onCancelar}>Cancelar</button>
            </div>
        </div>
    );
}
