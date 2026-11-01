import React, { useMemo } from 'react';
import { useFichaAtiva } from './FichaAlvoContext';
import { detalharRegeneracao } from '../../core/regeneracaoFontes';

const ROTULOS = { vida: 'Vida', mana: 'Mana', aura: 'Aura', chakra: 'Chakra', corpo: 'Corpo' };
const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('pt-BR');

// 💖 Regeneração total por turno de cada vital, com o que aumenta (+) e o que diminui (−).
export default function RegeneracaoResumo() {
    const { ficha } = useFichaAtiva();
    const detalhe = useMemo(() => (ficha ? detalharRegeneracao(ficha) : null), [ficha]);
    if (!detalhe) return null;
    const chaves = Object.keys(detalhe);

    return (
        <div className="regen-resumo">
            <h4 className="regen-resumo-titulo">💖 Regeneração por turno</h4>
            <table className="regen-tabela">
                <thead>
                    <tr><th>Vital</th><th>Regeneração</th><th>Cura passiva</th><th>Total (% do teto)</th><th>Pontos/turno</th></tr>
                </thead>
                <tbody>
                    {chaves.map((k) => {
                        const d = detalhe[k];
                        return (
                            <tr key={k}>
                                <td>{ROTULOS[k] || k}</td>
                                <td>{fmt(d.pctRegenCortada)}%</td>
                                <td>{d.curaPassiva.total > 0 ? `+${fmt(d.pctCuraPassiva)}%` : '—'}</td>
                                <td><strong>{fmt(d.pctTotalComCura)}%</strong></td>
                                <td>{fmt(d.totalPontos)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {chaves.map((k) => {
                const d = detalhe[k];
                const estados = d.corteEstados && d.corteEstados.estados.length > 0 ? d.corteEstados : null;
                return (
                    <details key={k} className="regen-vital">
                        <summary>{ROTULOS[k] || k}: {fmt(d.pctTotalComCura)}% de {fmt(d.tetoExibido)} = {fmt(d.totalPontos)}/turno{d.curaPassiva.total > 0 ? ` (Regeneração ${fmt(d.pctRegenCortada)}% + Cura passiva ${fmt(d.pctCuraPassiva)}%)` : ''}</summary>
                        <ul className="regen-lista">
                            <li>Manual: {fmt(d.manualPct)}%</li>
                            {d.fontes.map((f, i) => (
                                <li key={`${f.nome}-${i}`} className="regen-mais">+ {fmt(f.pct)}% {f.nome} ({f.origem})</li>
                            ))}
                            {d.cortes.map((f, i) => (
                                <li key={`c-${f.nome}-${i}`} className="regen-menos">− {fmt(Math.abs(f.pct))}% {f.nome} ({f.origem})</li>
                            ))}
                            {d.pctBruto !== d.pctTotal && (
                                <li className="regen-menos">− {fmt(d.pctBruto - d.pctTotal)}% acima do limite</li>
                            )}
                            {estados && (
                                <li className="regen-menos">
                                    − Estados cortando a cura (x{fmt(d.corteEstados.mult)}): {estados.estados.map(e => `${e.nome}${e.stacks > 1 ? ` x${e.stacks}` : ''}`).join(', ')}
                                </li>
                            )}
                            {k === 'vida' && d.curaPassiva.total > 0 && (
                                <li className="regen-mais">
                                    + Cura passiva (média por turno): {fmt(d.curaPassiva.total)} = {fmt(d.pctCuraPassiva)}% do teto ({d.curaPassiva.partes.map(p => `${p.nome} ${fmt(p.valor)}`).join(', ')})
                                </li>
                            )}
                            {d.avisos.map((a, i) => <li key={i} className="regen-aviso">{a}</li>)}
                            <li className="regen-total">Total: {fmt(d.pctTotalComCura)}% do teto = {fmt(d.totalPontos)} por turno</li>
                        </ul>
                    </details>
                );
            })}
        </div>
    );
}
