import React from 'react';
import { resumirProposta } from '../../core/sextaFeiraCriacao';

// 🛠️ Detalhes de uma criação: cartão da resposta da Sexta-Feira, pedidos pendentes no painel dela e
// pedido em destaque no Grimório da aba do Mestre.
export default function DetalhesCriacao({ tipo, objeto, avisos }) {
    if (!objeto) return null;
    const efeitos = [...(objeto.efeitos || []).map(e => ({ ...e, passivo: false })), ...(objeto.efeitosPassivos || []).map(e => ({ ...e, passivo: true }))];
    return (
        <div className="sexta-criacao-detalhes">
            <div className="sexta-criacao-resumo">{resumirProposta(tipo, objeto)}</div>
            {objeto.descricao && <p className="sexta-criacao-descricao">{objeto.descricao}</p>}
            {efeitos.length > 0 && (
                <ul className="sexta-criacao-efeitos">
                    {efeitos.map((e, i) => (
                        <li key={i}>{e.passivo ? '🛡️' : '⚡'} {e.nome}: <code>{e.atributo}</code> · <code>{e.propriedade}</code> = <strong>{e.valor}</strong></li>
                    ))}
                </ul>
            )}
            {tipo === 'combo' && (
                <ol className="sexta-criacao-efeitos">
                    {[objeto.iniciador, ...(objeto.passos || [])].map((g, i) => (
                        <li key={i}>{i === 0 ? '⚡' : '➡️'} <strong>{g.nome}</strong> ({g.acao}){(g.buffs || []).map((b, j) => <span key={j}> · <code>{b.atributo}</code> {b.propriedade} = <strong>{b.valor}</strong></span>)}</li>
                    ))}
                </ol>
            )}
            {tipo === 'followup' && (
                <ol className="sexta-criacao-efeitos">
                    {(objeto.niveis || []).map((n, i) => (
                        <li key={i}>Nível {i + 1} (a partir de {n.combos} Combos){(n.buffs || []).map((b, j) => <span key={j}> · <code>{b.atributo}</code> {b.propriedade} = <strong>{b.valor}</strong></span>)}</li>
                    ))}
                </ol>
            )}
            {tipo === 'tierlist' && (
                <ul className="sexta-criacao-efeitos">
                    {(objeto.ranks || []).map(r => <li key={r.nome}><strong>{r.rank}</strong> · {r.nome}</li>)}
                </ul>
            )}
            {(avisos || []).length > 0 && (
                <ul className="sexta-criacao-avisos">
                    {avisos.map((a, i) => <li key={i}>⚠️ {a}</li>)}
                </ul>
            )}
        </div>
    );
}
