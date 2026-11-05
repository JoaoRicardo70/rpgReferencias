import React from 'react';
import { resumirItemImportado, mudarCategoriaImportada } from '../../core/importadorIA';

const CATEGORIAS = [
    { id: 'habilidade', rotulo: 'Habilidade' },
    { id: 'poder', rotulo: 'Poder' },
    { id: 'forma', rotulo: 'Forma' },
];

const textoEfeito = (e) => `${String(e.atributo || '').replace('_', ' ').toUpperCase()} ${String(e.propriedade || '').toUpperCase()} ${e.valor}`;

function ListaEfeitos({ titulo, efeitos }) {
    if (!efeitos || efeitos.length === 0) return null;
    return (
        <div className="importacao-efeitos">
            <span className="importacao-efeitos-titulo">{titulo}</span>
            {efeitos.map((e, i) => <span key={i} className="importacao-chip" title={e.nome || ''}>{textoEfeito(e)}</span>)}
        </div>
    );
}

// 🔎 Prévia da importação: cada item que a IA devolveu, já validado pelo sistema, para o jogador conferir, trocar nome/categoria,
// desmarcar ou tirar antes de gravar no Grimório. Nada é gravado aqui: quem grava é o `onConfirmar`.
export default function ImportadorPrevia({ itens, onAtualizar, onRemover, onConfirmar, onVoltar, onAdicionarOutra }) {
    const marcados = itens.filter(it => it.marcado && it.valido).length;

    const trocarNome = (it, nome) => {
        const valido = nome.trim().length > 0;
        onAtualizar(it.chave, { ...it, objeto: { ...it.objeto, nome }, valido, marcado: valido ? it.marcado : false });
    };
    const trocarCategoria = (it, categoria) => onAtualizar(it.chave, { ...it, objeto: mudarCategoriaImportada(it.objeto, categoria) });

    return (
        <div className="importacao-previa">
            <div className="importacao-titulo">🔎 Prévia: confira antes de gravar ({marcados} de {itens.length} marcados)</div>
            {itens.map(it => (
                <div key={it.chave} className={`importacao-item${it.marcado ? '' : ' desmarcado'}${it.valido ? '' : ' invalido'}`}>
                    <div className="importacao-item-topo">
                        <input type="checkbox" checked={!!it.marcado} disabled={!it.valido} aria-label={`Importar ${it.objeto.nome || 'item sem nome'}`} onChange={e => onAtualizar(it.chave, { ...it, marcado: e.target.checked })} />
                        <input className="importacao-nome" value={it.objeto.nome} placeholder="Nome (obrigatório)" aria-label="Nome" onChange={e => trocarNome(it, e.target.value)} />
                        <select value={it.objeto.categoria} aria-label="Categoria" onChange={e => trocarCategoria(it, e.target.value)}>
                            {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
                        </select>
                        <button type="button" className="importacao-remover" title="Tirar da lista" aria-label="Tirar da lista" onClick={() => onRemover(it.chave)}>✕</button>
                    </div>
                    <div className="importacao-resumo">{resumirItemImportado(it.objeto)}{it.objeto.tipoAcao ? ` · ação: ${it.objeto.tipoAcao}` : ''}</div>
                    <ListaEfeitos titulo="Ativos:" efeitos={it.objeto.efeitos} />
                    <ListaEfeitos titulo="Passivos:" efeitos={it.objeto.efeitosPassivos} />
                    {it.avisos.map((a, i) => <div key={`a${i}`} className="importacao-aviso">⚠️ {a}</div>)}
                    {it.naoAplicado.length > 0 && (
                        <div className="importacao-nao-aplicado">
                            <div className="importacao-efeitos-titulo">📝 Não aplicado automaticamente (fica nas notas):</div>
                            {it.naoAplicado.map((n, i) => <div key={`n${i}`}>• {n}</div>)}
                        </div>
                    )}
                </div>
            ))}
            <div className="importacao-acoes">
                <button type="button" onClick={onVoltar}>Voltar</button>
                <button type="button" onClick={onAdicionarOutra}>+ Colar outra resposta</button>
                <button type="button" className="importacao-confirmar" disabled={marcados === 0} onClick={onConfirmar}>Gravar {marcados} no Grimório</button>
            </div>
        </div>
    );
}
