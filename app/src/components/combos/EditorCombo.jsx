import React, { useCallback } from 'react';
import { normalizarGolpe, LIMITES } from '../../core/combos';
import EditorGolpe from './EditorGolpe';

// Editor de um Combo: nome, o golpe INICIADOR e a fila fixa de golpes seguintes (1 → 2 → 3...).
export default function EditorCombo({ combo, onChange, onSalvar, onCancelar, ficha }) {
    const mudarPasso = useCallback((i, golpe) => onChange({ ...combo, passos: combo.passos.map((p, j) => (j === i ? golpe : p)) }), [combo, onChange]);
    const mover = useCallback((i, delta) => {
        const j = i + delta;
        if (j < 0 || j >= combo.passos.length) return;
        const passos = [...combo.passos];
        [passos[i], passos[j]] = [passos[j], passos[i]];
        onChange({ ...combo, passos });
    }, [combo, onChange]);

    const podeSalvar = combo.nome.trim() && combo.iniciador.nome.trim() && combo.passos.length > 0 && combo.passos.every(p => p.nome.trim());

    return (
        <div className="combo-editor" role="group" aria-label="Editor de Combo">
            <input className="input-neon" aria-label="Nome do Combo" placeholder="Nome do Combo" maxLength={LIMITES.nome} value={combo.nome} onChange={(e) => onChange({ ...combo, nome: e.target.value })} />
            <input className="input-neon" aria-label="Descrição do Combo" placeholder="Descrição (opcional)" maxLength={LIMITES.descricao} value={combo.descricao} onChange={(e) => onChange({ ...combo, descricao: e.target.value })} />
            <EditorGolpe golpe={combo.iniciador} onChange={(iniciador) => onChange({ ...combo, iniciador })} ficha={ficha} titulo="⚡ Iniciador (o Combo começa quando ele acerta)" />
            {combo.passos.map((passo, i) => (
                <div key={i} className="combo-passo">
                    <div className="combo-passo-topo">
                        <strong>Golpe {i + 2}</strong>
                        <span>
                            <button type="button" className="combo-mini" aria-label={`Subir o golpe ${i + 2}`} disabled={i === 0} onClick={() => mover(i, -1)}>↑</button>
                            <button type="button" className="combo-mini" aria-label={`Descer o golpe ${i + 2}`} disabled={i === combo.passos.length - 1} onClick={() => mover(i, 1)}>↓</button>
                            <button type="button" className="combo-mini" aria-label={`Remover o golpe ${i + 2}`} onClick={() => onChange({ ...combo, passos: combo.passos.filter((_, j) => j !== i) })}>🗑</button>
                        </span>
                    </div>
                    <EditorGolpe golpe={passo} onChange={(g) => mudarPasso(i, g)} ficha={ficha} />
                </div>
            ))}
            <button type="button" className="btn-neon" disabled={combo.passos.length >= LIMITES.passos} onClick={() => onChange({ ...combo, passos: [...combo.passos, normalizarGolpe({})] })}>➕ Adicionar golpe ao Combo</button>
            <div className="combo-acoes">
                <button type="button" className="btn-neon" onClick={onSalvar} disabled={!podeSalvar}>✅ Salvar Combo</button>
                <button type="button" className="btn-neon combo-cancelar" onClick={onCancelar}>Cancelar</button>
            </div>
            {!podeSalvar && <span className="combo-vazio">Dê nome ao Combo e a todos os golpes, e inclua pelo menos um golpe depois do iniciador.</span>}
        </div>
    );
}
