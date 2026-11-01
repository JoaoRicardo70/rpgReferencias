import React, { useState, useCallback } from 'react';
import { useFichaAtiva, useCallSaveAtivo } from '../Ficha Def/FichaAlvoContext';
import { ESTADOS, MAX_STACKS } from '../../core/condicoes';
import { normalizarAplicaEstados, ATRIBUTOS_TESTE, ROTULO_ATRIBUTO, LIMITES_ESTADOS, estadoDoTipoDeArma } from '../../core/estadosGolpe';
import { lerAlvoDeEditor, acharAlvoParaGravar } from './alvoDeEditor';
import { MODOS_REFLEXO, MODOS_CUSTO_REFLEXO, ENERGIAS_REFLEXO, normalizarReflexo } from '../../core/reflexo';

// 🩸 Lista de "estados que este golpe aplica" (core/estadosGolpe.js): estado, stacks, teste de resistência opcional e "só em crítico".
export function ListaAplicaEstados({ lista, onChange }) {
    const itens = Array.isArray(lista) ? lista : [];
    const alterar = (i, patch) => onChange(itens.map((e, j) => (j === i ? { ...e, ...patch } : e)));
    return (
        <div className="estados-golpe-lista">
            {itens.map((e, i) => (
                <div key={i} className="estados-golpe-linha">
                    <select className="input-neon" aria-label="Estado" value={e.id} onChange={ev => alterar(i, { id: ev.target.value })}>
                        {ESTADOS.map(s => <option key={s.id} value={s.id}>{s.icone} {s.nome}</option>)}
                    </select>
                    <input className="input-neon estados-golpe-num" type="number" min="1" max={MAX_STACKS} aria-label="Stacks" title="Stacks aplicados (1 a 6)" value={e.stacks} onChange={ev => alterar(i, { stacks: Math.max(1, Math.min(MAX_STACKS, parseInt(ev.target.value) || 1)) })} />
                    <select className="input-neon" aria-label="Teste de resistência" value={e.teste ? e.teste.atributo : ''} onChange={ev => alterar(i, { teste: ev.target.value ? { atributo: ev.target.value, cd: (e.teste && e.teste.cd) || 15 } : undefined })}>
                        <option value="">Sem teste</option>
                        {ATRIBUTOS_TESTE.map(a => <option key={a} value={a}>Teste de {ROTULO_ATRIBUTO[a]}</option>)}
                    </select>
                    {e.teste && <input className="input-neon estados-golpe-num" type="number" min="1" max={LIMITES_ESTADOS.cdMax} aria-label="CD do teste" title="CD do teste do alvo" value={e.teste.cd} onChange={ev => alterar(i, { teste: { ...e.teste, cd: Math.max(1, parseInt(ev.target.value) || 1) } })} />}
                    <label className="estados-golpe-check"><input type="checkbox" checked={!!e.apenasCritico} onChange={ev => alterar(i, { apenasCritico: ev.target.checked })} /> só em crítico</label>
                    <button type="button" className="descricoes-ataque-remover" aria-label="Remover estado" onClick={() => onChange(itens.filter((_, j) => j !== i))}>✖</button>
                </div>
            ))}
            {itens.length < LIMITES_ESTADOS.porFonte && (
                <button type="button" className="descricoes-ataque-adicionar" onClick={() => onChange([...itens, { id: 'sangrando', stacks: 1 }])}>+ Estado</button>
            )}
        </div>
    );
}

// ↩️ Campos do Reflexo (core/reflexo.js). `reflexo` nulo = sem reflexo.
export function CamposReflexo({ reflexo, onChange }) {
    const r = reflexo || null;
    if (!r) return <button type="button" className="descricoes-ataque-adicionar" onClick={() => onChange(normalizarReflexo({ modo: 'devolver' }))}>+ Ativar Reflexo (devolver o ataque)</button>;
    const alterar = (patch) => onChange({ ...r, ...patch });
    const modo = MODOS_REFLEXO.find(m => m.id === r.modo);
    return (
        <div className="estados-golpe-reflexo">
            <div className="estados-golpe-linha">
                <select className="input-neon" aria-label="Modo do Reflexo" value={r.modo} onChange={e => alterar({ modo: e.target.value, mult: e.target.value === 'contra' ? 150 : 100 })}>
                    {MODOS_REFLEXO.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
                <label className="estados-golpe-check">Dano devolvido <input className="input-neon estados-golpe-num" type="number" min="10" max="1000" aria-label="Percentual devolvido" value={r.mult} onChange={e => alterar({ mult: parseInt(e.target.value) || 100 })} />%</label>
                <button type="button" className="descricoes-ataque-remover" aria-label="Remover Reflexo" onClick={() => onChange(null)}>✖</button>
            </div>
            <p className="descricoes-ataque-dica">{modo ? modo.dica : ''} Vale com o Poder Ativo / a Técnica Equipada.</p>
            <div className="estados-golpe-linha">
                <select className="input-neon" aria-label="Como o Reflexo cobra o custo" value={r.custoModo} onChange={e => alterar({ custoModo: e.target.value })}>
                    {MODOS_CUSTO_REFLEXO.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
                <label className="estados-golpe-check" title="Se a sua ficha pode conjurar como Poder, o Reflexo não gasta energia e o efeito continua igual."><input type="checkbox" checked={r.comoPoder} onChange={e => alterar({ comoPoder: e.target.checked })} /> conjurar como Poder (sem custo)</label>
            </div>
            <div className="estados-golpe-linha">
                <label className="estados-golpe-check">Custo <input className="input-neon estados-golpe-num" type="number" min="0" max="100" aria-label="Custo do Reflexo em porcentagem" value={r.custoPercentual} onChange={e => alterar({ custoPercentual: parseFloat(e.target.value) || 0 })} />% de
                    <select className="input-neon" aria-label="Energia do Reflexo" value={r.energia} onChange={e => alterar({ energia: e.target.value })}>
                        {ENERGIAS_REFLEXO.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                </label>
                <label className="estados-golpe-check"><input type="checkbox" checked={r.gastaReacao} onChange={e => alterar({ gastaReacao: e.target.checked })} /> gasta 1 Reação</label>
                <label className="estados-golpe-check" title="Dispara sozinho quando alguém aplica Dano direto em você; sem isto, você escolhe na aba Defesa ao receber o Dano."><input type="checkbox" checked={r.automatico} onChange={e => alterar({ automatico: e.target.checked })} /> automático</label>
            </div>
        </div>
    );
}

// Editor no card de um item da ficha (Poder, Técnica elemental ou Item/Arma): grava direto nele.
// colecao: 'poderes' | 'ataquesElementais' | 'inventario'. comReflexo: só Poderes e Técnicas.
export default function EstadosGolpeEditor({ colecao, itemId, estado = 'base', comReflexo = false }) {
    const { ficha, updateFicha } = useFichaAtiva();
    const callSave = useCallSaveAtivo();
    const [aberto, setAberto] = useState(false);
    const item = lerAlvoDeEditor(ficha, colecao, itemId, estado);

    const gravar = useCallback((campo, valor) => {
        updateFicha((f) => {
            const alvo = acharAlvoParaGravar(f, colecao, itemId, estado);
            if (!alvo) return;
            if (campo === 'reflexo') { if (valor) alvo.reflexo = normalizarReflexo(valor); else delete alvo.reflexo; }
            else alvo.aplicaEstados = normalizarAplicaEstados(valor);
        });
        callSave();
    }, [updateFicha, callSave, colecao, itemId, estado]);

    if (!item) return null;
    const estados = Array.isArray(item.aplicaEstados) ? item.aplicaEstados : [];
    const doTipo = colecao === 'inventario' && item.tipo === 'arma' && estados.length === 0 ? estadoDoTipoDeArma(item.armaTipo) : null;
    const resumo = estados.length + (item.reflexo ? 1 : 0);

    return (
        <div className="descricoes-ataque estados-golpe">
            <button type="button" className="descricoes-ataque-titulo" aria-expanded={aberto} onClick={() => setAberto(a => !a)}>
                🩸 Estados e Reflexo {resumo > 0 ? `(${resumo})` : ''} {aberto ? '▲' : '▼'}
            </button>
            {aberto && (
                <div className="descricoes-ataque-corpo">
                    <p className="descricoes-ataque-dica">Estados negativos que este golpe aplica em quem for atingido. O alvo pode resistir com um teste de atributo contra a CD.</p>
                    {doTipo && <p className="descricoes-ataque-dica">Sem estado próprio, uma arma do tipo "{item.armaTipo}" aplica 1 stack de {doTipo.id === 'sangrando' ? 'Sangrando' : 'Lento'} em um crítico.</p>}
                    <ListaAplicaEstados lista={estados} onChange={(l) => gravar('aplicaEstados', l)} />
                    {comReflexo && (
                        <>
                            <p className="descricoes-ataque-dica">↩️ Reflexo: devolve o ataque que você receberia. Caso raro, só com o item Ativo/Equipado.</p>
                            <CamposReflexo reflexo={item.reflexo || null} onChange={(r) => gravar('reflexo', r)} />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// Estados do Ataque livre (fórmula livre e golpes sem fonte própria): ficam em ficha.ataqueConfig.estadosGolpe.
export function EstadosAtaqueLivre() {
    const { ficha, updateFicha } = useFichaAtiva();
    const callSave = useCallSaveAtivo();
    const [aberto, setAberto] = useState(false);
    const lista = (ficha && ficha.ataqueConfig && ficha.ataqueConfig.estadosGolpe) || [];
    const gravar = useCallback((nova) => {
        updateFicha((f) => { if (!f.ataqueConfig) f.ataqueConfig = {}; f.ataqueConfig.estadosGolpe = normalizarAplicaEstados(nova); });
        callSave();
    }, [updateFicha, callSave]);
    return (
        <div className="descricoes-ataque estados-golpe">
            <button type="button" className="descricoes-ataque-titulo" aria-expanded={aberto} onClick={() => setAberto(a => !a)}>
                🩸 Estados que meus golpes aplicam {lista.length > 0 ? `(${lista.length})` : ''} {aberto ? '▲' : '▼'}
            </button>
            {aberto && (
                <div className="descricoes-ataque-corpo">
                    <p className="descricoes-ataque-dica">Valem em todo golpe que você rolar (Ataque e fórmula livre), somados aos do Poder, da Técnica e da arma em uso.</p>
                    <ListaAplicaEstados lista={lista} onChange={gravar} />
                </div>
            )}
        </div>
    );
}
