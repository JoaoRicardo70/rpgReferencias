import React from 'react';
import { entropiasAtivas, entropiasVisiveis, descreverEfeitoEntropia } from '../../core/entropia';

// 🌀 Selo da Entropia da Entidade: mostra as Entropias LIGADAS de uma ficha. O Mestre vê todas (as ocultas com a marca 🙈);
// o dono e os demais só veem as que não são secretas. Sem Entropia ligada, não ocupa espaço.
export default function EntropiaSelo({ ficha, isMestre = false, compacto = false }) {
    const lista = isMestre ? entropiasAtivas(ficha) : entropiasVisiveis(ficha);
    if (lista.length === 0) return null;
    if (compacto) {
        return <span className="entropia-selo-compacto" title={lista.map(e => e.nome).join(', ')}>🌀 {lista.length > 1 ? `Entropia ×${lista.length}` : lista[0].nome}</span>;
    }
    return (
        <div className="entropia-selo" role="status" aria-label="Entropia da Entidade">
            <strong className="entropia-selo-titulo">🌀 Entropia da Entidade</strong>
            {lista.map(e => (
                <div key={e.id} className="entropia-selo-item">
                    <span className="entropia-selo-nome">{e.nome}{e.oculta ? ' 🙈' : ''}</span>
                    {e.descricao && <span className="entropia-selo-desc">{e.descricao}</span>}
                    {e.efeitos.length > 0 && <span className="entropia-selo-efeitos">{e.efeitos.map(descreverEfeitoEntropia).join(' · ')}</span>}
                </div>
            ))}
        </div>
    );
}
