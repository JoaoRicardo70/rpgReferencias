import React, { useMemo } from 'react';
import { analisarMarkdown } from '../../core/markdownSexta';

// Mostra a resposta da Sexta-Feira formatada (títulos, negrito, listas, tabelas, código) a partir
// da árvore de core/markdownSexta.js. Só gera elementos React: nenhum HTML da IA é injetado.
function Inline({ nos }) {
    return (nos || []).map((no, i) => {
        if (no.tipo === 'negrito') return <strong key={i}><Inline nos={no.filhos} /></strong>;
        if (no.tipo === 'italico') return <em key={i}><Inline nos={no.filhos} /></em>;
        if (no.tipo === 'codigo') return <code key={i} className="sexta-md-code">{no.valor}</code>;
        return <React.Fragment key={i}>{no.valor}</React.Fragment>;
    });
}

function Bloco({ bloco }) {
    switch (bloco.tipo) {
        case 'titulo': {
            const Tag = `h${Math.min(6, Math.max(3, bloco.nivel + 2))}`;
            return <Tag className="sexta-md-titulo"><Inline nos={bloco.inline} /></Tag>;
        }
        case 'lista': {
            const Tag = bloco.ordenada ? 'ol' : 'ul';
            return <Tag className="sexta-md-lista">{bloco.itens.map((item, i) => <li key={i}><Inline nos={item} /></li>)}</Tag>;
        }
        case 'tabela':
            return (
                <div className="sexta-md-tabela-wrap">
                    <table className="sexta-md-tabela">
                        <thead><tr>{bloco.cabecalho.map((c, i) => <th key={i}><Inline nos={c} /></th>)}</tr></thead>
                        <tbody>{bloco.linhas.map((linha, i) => <tr key={i}>{linha.map((c, j) => <td key={j}><Inline nos={c} /></td>)}</tr>)}</tbody>
                    </table>
                </div>
            );
        case 'codigo':
            return <pre className="sexta-md-pre"><code>{bloco.texto}</code></pre>;
        case 'citacao':
            return <blockquote className="sexta-md-citacao"><Inline nos={bloco.inline} /></blockquote>;
        case 'regua':
            return <hr className="sexta-md-regua" />;
        default:
            return (
                <p className="sexta-md-paragrafo">
                    {bloco.linhas.map((l, i) => <React.Fragment key={i}>{i > 0 && <br />}<Inline nos={l} /></React.Fragment>)}
                </p>
            );
    }
}

export default function MarkdownSexta({ texto }) {
    const blocos = useMemo(() => analisarMarkdown(texto), [texto]);
    return <div className="sexta-md">{blocos.map((b, i) => <Bloco key={i} bloco={b} />)}</div>;
}
