import React, { useState, useCallback, useEffect } from 'react';
import { useFichaAtiva, useCallSaveAtivo } from '../Ficha Def/FichaAlvoContext';
import { TIPOS_AO_ACERTAR, MODOS_AO_ACERTAR, ENERGIAS_AO_ACERTAR, LIMITE_AO_ACERTAR, normalizarAoAcertar } from '../../core/aoAcertar';
import { lerAlvoDeEditor, acharAlvoParaGravar } from './alvoDeEditor';

// 💚 Lista de "o que acontece com quem acertou" (core/aoAcertar.js): cura ou energia, valor fixo / % do atual / % do máximo.
// `onChange` grava na hora (selects, caixas, +/remover); `onDigitar` só atualiza a lista local enquanto se digita um valor (campo vazio
// ou '5,' não pode fazer a linha sumir); o valor é gravado ao sair do campo (onBlur).
export function ListaAoAcertar({ lista, onChange, onDigitar }) {
    const itens = Array.isArray(lista) ? lista : [];
    const alterar = (i, patch) => onChange(itens.map((e, j) => (j === i ? { ...e, ...patch } : e)));
    const digitar = (i, valor) => (onDigitar || onChange)(itens.map((e, j) => (j === i ? { ...e, valor } : e)));
    return (
        <div className="estados-golpe-lista">
            {itens.map((e, i) => (
                <div key={i} className="estados-golpe-linha">
                    <select className="input-neon" aria-label="O que acontece" value={e.tipo} onChange={ev => alterar(i, { tipo: ev.target.value })}>
                        {TIPOS_AO_ACERTAR.map(t => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
                    </select>
                    {e.tipo === 'energiaAtacante' && (
                        <select className="input-neon" aria-label="Energia restaurada" value={e.energia || 'mana'} onChange={ev => alterar(i, { energia: ev.target.value })}>
                            {ENERGIAS_AO_ACERTAR.map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                    )}
                    <input className="input-neon estados-golpe-num" type="number" min="0" aria-label="Valor" title="Valor fixo na escala exibida (como o Dano) ou a porcentagem" value={e.valor} onChange={ev => digitar(i, ev.target.value)} onBlur={() => onChange(itens)} />
                    <select className="input-neon" aria-label="Como o valor é medido" value={e.modo} onChange={ev => alterar(i, { modo: ev.target.value })}>
                        {MODOS_AO_ACERTAR.map(m => <option key={m.id} value={m.id}>{m.rotulo}</option>)}
                    </select>
                    <label className="estados-golpe-check"><input type="checkbox" checked={!!e.apenasCritico} onChange={ev => alterar(i, { apenasCritico: ev.target.checked })} /> só em crítico</label>
                    <button type="button" className="descricoes-ataque-remover" aria-label="Remover efeito ao acertar" onClick={() => onChange(itens.filter((_, j) => j !== i))}>✖</button>
                </div>
            ))}
            {itens.length < LIMITE_AO_ACERTAR && (
                <button type="button" className="descricoes-ataque-adicionar" onClick={() => onChange([...itens, { tipo: 'curarAtacante', modo: 'percMax', valor: 5 }])}>+ Ao acertar</button>
            )}
        </div>
    );
}

// Editor no card de um item da ficha (Poder ou Técnica elemental): grava direto nele. colecao: 'poderes' | 'ataquesElementais' | 'inventario'.
export default function AoAcertarEditor({ colecao, itemId }) {
    const { ficha, updateFicha } = useFichaAtiva();
    const callSave = useCallSaveAtivo();
    const [aberto, setAberto] = useState(false);
    const item = lerAlvoDeEditor(ficha, colecao, itemId, 'base');
    // Lista em edição (inclui linhas com valor ainda incompleto); volta ao que está na ficha quando ela muda por fora.
    const [local, setLocal] = useState(() => (item && Array.isArray(item.aoAcertar) ? item.aoAcertar : []));
    const chaveFicha = `${itemId}|${JSON.stringify((item && item.aoAcertar) || [])}`;
    useEffect(() => { setLocal(item && Array.isArray(item.aoAcertar) ? item.aoAcertar : []); }, [chaveFicha]); // eslint-disable-line react-hooks/exhaustive-deps

    const gravar = useCallback((valor) => {
        setLocal(valor);
        // A lista editada fica como o usuário digitou (valor em texto) até salvar: normaliza só o que vai para a ficha.
        updateFicha((f) => {
            const alvo = acharAlvoParaGravar(f, colecao, itemId, 'base');
            if (!alvo) return;
            const limpa = normalizarAoAcertar(valor);
            if (limpa.length > 0) alvo.aoAcertar = limpa; else delete alvo.aoAcertar;
        });
        callSave();
    }, [updateFicha, callSave, colecao, itemId]);

    if (!item) return null;
    const lista = local;

    return (
        <div className="descricoes-ataque estados-golpe">
            <button type="button" className="descricoes-ataque-titulo" aria-expanded={aberto} onClick={() => setAberto(a => !a)}>
                💚 Ao acertar {lista.length > 0 ? `(${lista.length})` : ''} {aberto ? '▲' : '▼'}
            </button>
            {aberto && (
                <div className="descricoes-ataque-corpo">
                    <p className="descricoes-ataque-dica">O que acontece com QUEM ACERTOU quando este golpe atinge um alvo e causa Dano: cura a Vida ou restaura uma energia. Vale uma vez por golpe (mesmo em área), com alvo marcado, e nunca passa do máximo.</p>
                    <ListaAoAcertar lista={lista} onChange={gravar} onDigitar={setLocal} />
                </div>
            )}
        </div>
    );
}
