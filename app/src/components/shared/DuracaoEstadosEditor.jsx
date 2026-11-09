import React from 'react';
import { condicoesDaFicha, nomeDoEstado, iconeDoEstado } from '../../core/condicoes';
import { duracoesDaFicha, rotuloDuracao, DURACAO_ESTADO_MAX } from '../../core/duracaoEstados';

// ⏳ Estados ativos com a duração em turnos (core/duracaoEstados.js). O dono e o Mestre editam ou tiram o prazo à mão:
// campo vazio = permanente (até remover). `onDefinir(idDoEstado, turnos | '')` grava; quem usa decide onde.
export default function DuracaoEstadosEditor({ ficha, onDefinir }) {
    const ativos = condicoesDaFicha(ficha);
    if (ativos.length === 0) return null;
    const mapa = duracoesDaFicha(ficha);
    return (
        <ul className="estados-duracoes" aria-label="Duração dos estados">
            {ativos.map((c) => (
                <li key={c.id} className="estados-duracao-linha">
                    <span className="estados-duracao-nome">{iconeDoEstado(c.id)} {nomeDoEstado(c.id)}</span>
                    <span className="estados-duracao-selo" aria-label={`Duração de ${nomeDoEstado(c.id)}`}>{mapa[c.id] ? rotuloDuracao(mapa[c.id]) : 'até remover'}</span>
                    <input
                        className="input-neon estados-golpe-num"
                        type="number"
                        min="1"
                        max={DURACAO_ESTADO_MAX}
                        aria-label={`Duração de ${nomeDoEstado(c.id)} (turnos, vazio = até remover)`}
                        title="Duração em turnos (vazio = até remover)"
                        placeholder="turnos"
                        defaultValue={mapa[c.id] || ''}
                        key={`${c.id}_${mapa[c.id] || 0}`}
                        onBlur={e => { const v = e.target.value.trim(); if (v !== String(mapa[c.id] || '')) onDefinir(c.id, v); }}
                    />
                    {mapa[c.id] ? <button type="button" className="combo-mini" aria-label={`Tirar o prazo de ${nomeDoEstado(c.id)}`} title="Tirar o prazo (fica até remover)" onClick={() => onDefinir(c.id, '')}>✕</button> : null}
                </li>
            ))}
        </ul>
    );
}
