import React, { useState, useCallback, useMemo } from 'react';
import useStore from '../../stores/useStore';
import { useFichaAtiva, useCallSaveAtivo } from '../Ficha Def/FichaAlvoContext';
import EditorBuffs from '../combos/EditorBuffs';
import { lerAlvoDeEditor, acharAlvoParaGravar } from './alvoDeEditor';
import { normalizarSuporte, MODOS_ALVO_SUPORTE, MODOS_SUPORTE, DURACOES_SUPORTE, ACOES_SUPORTE, LIMITES_SUPORTE } from '../../core/suporte';
import { usarSuporte } from '../../services/suporte';

const SUPORTE_VAZIO = { cura: { dadosQtd: 0, dadosFaces: 8, fixo: 0, percVida: 0 }, buffs: [], modo: 'uso', duracaoModo: 'turnos', duracao: 3, alvos: 'aliados', maxAlvos: 3, custoPercentual: 0, energia: 'mana', acao: 'padrao' };

// ✨ Cura e Buffs de um Poder, Técnica ou Item (core/suporte.js): configura (cura em dados/fixo/% da Vida e buffs temporários em
// si e/ou em aliados) e USA, escolhendo os aliados. Grava direto no item da ficha em foco.
// colecao: 'poderes' | 'ataquesElementais' | 'inventario'
export default function SuporteEditor({ colecao, itemId, estado = 'base' }) {
    const { ficha, updateFicha, nome: meuNome } = useFichaAtiva();
    const callSave = useCallSaveAtivo();
    const personagens = useStore(s => s.personagens);
    const adicionarAviso = useStore(s => s.adicionarAviso);
    const [aberto, setAberto] = useState(false);
    const [rascunho, setRascunho] = useState(null);
    const [escolhidos, setEscolhidos] = useState([]);

    const item = lerAlvoDeEditor(ficha, colecao, itemId, estado);
    const atual = useMemo(() => normalizarSuporte(item && item.suporte), [item]);
    const form = rascunho || (atual ? { ...SUPORTE_VAZIO, ...atual, cura: atual.cura || SUPORTE_VAZIO.cura } : SUPORTE_VAZIO);
    const aliadosPossiveis = useMemo(() => Object.keys(personagens || {}).filter(n => n && n !== meuNome && personagens[n]), [personagens, meuNome]);

    const alterar = useCallback((patch) => setRascunho({ ...form, ...patch }), [form]);
    const alterarCura = (patch) => alterar({ cura: { ...form.cura, ...patch } });

    const salvar = useCallback(() => {
        const normalizado = normalizarSuporte(form);
        updateFicha((f) => {
            const alvo = acharAlvoParaGravar(f, colecao, itemId, estado);
            if (!alvo) return;
            if (normalizado) alvo.suporte = normalizado; else delete alvo.suporte;
        });
        callSave();
        setRascunho(null);
        adicionarAviso && adicionarAviso(normalizado ? 'Cura/Buffs salvos.' : 'Nada para salvar: coloque uma Cura ou um Buff.', normalizado ? 'info' : 'alerta');
    }, [form, updateFicha, callSave, colecao, itemId, estado, adicionarAviso]);

    const remover = useCallback(() => {
        updateFicha((f) => { const alvo = acharAlvoParaGravar(f, colecao, itemId, estado); if (alvo) delete alvo.suporte; });
        callSave();
        setRascunho(null);
    }, [updateFicha, callSave, colecao, itemId, estado]);

    const usar = useCallback(() => {
        const r = usarSuporte({ item, aliados: escolhidos, ctx: { meuNome, minhaFicha: ficha, personagens, updateFicha, salvarFichaSilencioso: callSave } });
        if (r.erro) adicionarAviso && adicionarAviso(r.erro, 'alerta');
        else if (r.texto) adicionarAviso && adicionarAviso(r.texto, 'info');
    }, [item, escolhidos, meuNome, ficha, personagens, updateFicha, callSave, adicionarAviso]);

    if (!item) return null;
    const alternarAliado = (n) => setEscolhidos(l => (l.includes(n) ? l.filter(x => x !== n) : [...l, n]));
    const passivo = form.modo === 'passivo';
    const precisaAliados = atual && atual.alvos !== 'si';

    return (
        <div className="descricoes-ataque suporte-editor">
            <button type="button" className="descricoes-ataque-titulo" aria-expanded={aberto} onClick={() => setAberto(a => !a)}>
                ✨ Cura e Buffs {atual ? '(configurado)' : ''} {aberto ? '▲' : '▼'}
            </button>
            {aberto && (
                <div className="descricoes-ataque-corpo">
                    <p className="descricoes-ataque-dica">Cura vida e/ou dá buffs a você e/ou a aliados. A cura sofre os cortes de estados como Sangrando.</p>
                    <div className="estados-golpe-linha">
                        <select className="input-neon" aria-label="Como funciona" value={form.modo} onChange={e => alterar({ modo: e.target.value })}>
                            {MODOS_SUPORTE.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                        </select>
                    </div>
                    {passivo && <p className="descricoes-ataque-dica">Passivo: os buffs ficam ligados enquanto o Poder estiver Ativo / a Técnica, o Item ou a Arma em uso, só em você, sem custo. A cura entra como Regeneração no começo do seu turno.</p>}
                    <div className="estados-golpe-linha">
                        <label className="estados-golpe-check">Cura: <input className="input-neon estados-golpe-num" type="number" min="0" max={LIMITES_SUPORTE.dadosQtd} aria-label="Quantidade de dados da cura" value={form.cura.dadosQtd} onChange={e => alterarCura({ dadosQtd: parseInt(e.target.value) || 0 })} />d
                            <input className="input-neon estados-golpe-num" type="number" min="2" aria-label="Faces dos dados da cura" value={form.cura.dadosFaces} onChange={e => alterarCura({ dadosFaces: parseInt(e.target.value) || 2 })} /></label>
                        <label className="estados-golpe-check">+ <input className="input-neon estados-golpe-num" type="number" min="0" aria-label="Cura fixa" value={form.cura.fixo} onChange={e => alterarCura({ fixo: parseFloat(e.target.value) || 0 })} /></label>
                        <label className="estados-golpe-check">+ <input className="input-neon estados-golpe-num" type="number" min="0" max="1000" aria-label="Cura em porcentagem da Vida" value={form.cura.percVida} onChange={e => alterarCura({ percVida: parseFloat(e.target.value) || 0 })} />% da Vida</label>
                    </div>
                    {passivo && <div className="estados-golpe-linha">
                        <span className="estados-golpe-check">Regenera energias (% do máximo por turno):</span>
                        {[['mana', 'Mana'], ['aura', 'Aura'], ['chakra', 'Chakra'], ['corpo', 'Corpo']].map(([k, rotulo]) => (
                            <label key={k} className="estados-golpe-check">{rotulo} <input className="input-neon estados-golpe-num" type="number" min="0" max="100" aria-label={`Regenera ${rotulo} (% do máximo por turno)`} value={(form.cura.energias && form.cura.energias[k]) || 0} onChange={e => alterarCura({ energias: { ...(form.cura.energias || {}), [k]: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) } })} /></label>
                        ))}
                    </div>}
                    <EditorBuffs buffs={form.buffs} onChange={(b) => alterar({ buffs: b })} rotulo="Buffs temporários" />
                    {!passivo && <div className="estados-golpe-linha">
                        <select className="input-neon" aria-label="Quem recebe" value={form.alvos} onChange={e => alterar({ alvos: e.target.value })}>
                            {MODOS_ALVO_SUPORTE.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                        </select>
                        {form.alvos !== 'si' && <label className="estados-golpe-check">até <input className="input-neon estados-golpe-num" type="number" min="1" max={LIMITES_SUPORTE.maxAlvos} aria-label="Máximo de aliados" value={form.maxAlvos} onChange={e => alterar({ maxAlvos: parseInt(e.target.value) || 1 })} /> aliado(s)</label>}
                        <select className="input-neon" aria-label="Duração do buff" value={form.duracaoModo} onChange={e => alterar({ duracaoModo: e.target.value })}>
                            {DURACOES_SUPORTE.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                        </select>
                        {form.duracaoModo === 'turnos' && <label className="estados-golpe-check">por <input className="input-neon estados-golpe-num" type="number" min="1" max={LIMITES_SUPORTE.duracaoMax} aria-label="Duração do buff em turnos" value={form.duracao} onChange={e => alterar({ duracao: parseInt(e.target.value) || 1 })} /> turno(s)</label>}
                    </div>}
                    {!passivo && <div className="estados-golpe-linha">
                        <label className="estados-golpe-check">Custo <input className="input-neon estados-golpe-num" type="number" min="0" max="100" aria-label="Custo em porcentagem" value={form.custoPercentual} onChange={e => alterar({ custoPercentual: parseFloat(e.target.value) || 0 })} />% de
                            <select className="input-neon" aria-label="Energia do suporte" value={form.energia} onChange={e => alterar({ energia: e.target.value })}>
                                {['mana', 'aura', 'chakra'].map(k => <option key={k} value={k}>{k}</option>)}
                            </select></label>
                        <select className="input-neon" aria-label="Ação gasta" value={form.acao} onChange={e => alterar({ acao: e.target.value })}>
                            {ACOES_SUPORTE.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                        </select>
                    </div>}
                    <div className="estados-golpe-linha">
                        <button type="button" className="btn-neon btn-small" onClick={salvar}>💾 Salvar Cura/Buffs</button>
                        {atual && <button type="button" className="btn-neon btn-red btn-small" onClick={remover}>Remover</button>}
                    </div>
                    {atual && atual.modo !== 'passivo' && (
                        <div className="suporte-usar">
                            <strong>Usar agora</strong>
                            {precisaAliados && (
                                <div className="suporte-aliados" role="group" aria-label="Aliados que recebem">
                                    {aliadosPossiveis.length === 0 && <span className="combo-vazio">Nenhum aliado na mesa.</span>}
                                    {aliadosPossiveis.map(n => (
                                        <label key={n} className="estados-golpe-check"><input type="checkbox" checked={escolhidos.includes(n)} onChange={() => alternarAliado(n)} /> {n}</label>
                                    ))}
                                </div>
                            )}
                            <button type="button" className="btn-neon btn-green btn-small" onClick={usar}>✨ Usar {item.nome}</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
