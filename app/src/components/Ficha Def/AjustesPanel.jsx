import React, { useState, useEffect, useCallback } from 'react';
import { getBuffs } from '../../core/attributes';
import { capturarMaximosAtuais, rescalarVitaisProporcional, getTetoExibidoComFator } from '../../core/vitals';
import { getRegeneracaoManualPct, limitarRegeneracaoPct } from '../../core/regeneracao';
import { ATRIBUTO_OPTIONS, STATS, ENERGIAS } from '../ficha/FichaFormContext';
import { useFichaAtiva, useCallSaveAtivo } from './FichaAlvoContext';

// ⚙️ AJUSTES DA FICHA (página 7 da Ficha Definitiva): os editores "crus" que só existiam na aba
// antiga de Ficha — Editor de Atributos (Base / Mult Base / Regeneração) e Multiplicadores de Poder.
// Lê/grava a ficha ativa (a minha, ou a do personagem que o Mestre está vendo).

// Status (Força/Destreza/...) são gravados 1000x maiores que o número mostrado/editado.
const FATOR_EXIBICAO_STATUS = 1000;

const ESTADO_MULT_VAZIO = { base: 1, potencial: 1, geral: 1, formas: 1, absoluto: 1, unico: '1.0', danoBruto: 0 };

// Mostra o quanto de buff a Classe/itens/etc. já somam naquele campo ("(Buff: +0.50)").
function Buff({ valor, ativo }) {
    if (!ativo) return null;
    return <span className="ajustes-buff">(Buff: +{Number(valor).toFixed(2)})</span>;
}

function EditorAtributos({ ficha, updateFicha, callSave }) {
    const [selecionado, setSelecionado] = useState('forca');
    const [campos, setCampos] = useState({ base: 0, mBase: 1, regeneracao: 0 });
    const [salvo, setSalvo] = useState(false);

    const carregar = useCallback(() => {
        const k = selecionado === 'todos_status' ? 'forca' : selecionado === 'todas_energias' ? 'mana' : selecionado;
        if (!ficha || !ficha[k]) { setCampos({ base: 0, mBase: 1, regeneracao: 0 }); return; }
        const st = ficha[k];
        const fator = (selecionado === 'todos_status' || STATS.includes(k)) ? FATOR_EXIBICAO_STATUS : 1;
        let teto = 0;
        try { teto = getTetoExibidoComFator(k, ficha); } catch (e) { /* atributo sem teto */ }
        setCampos({ base: (st.base || 0) / fator, mBase: st.mBase || 1, regeneracao: Math.round(getRegeneracaoManualPct(st, teto) * 100) / 100 });
    }, [selecionado, ficha]);

    useEffect(() => { carregar(); }, [carregar]);

    const alterarCampo = useCallback((campo, valor) => { setCampos(prev => ({ ...prev, [campo]: valor })); }, []);

    const salvar = useCallback(() => {
        let alvos;
        if (selecionado === 'todos_status') alvos = [...STATS];
        else if (selecionado === 'todas_energias') alvos = [...ENERGIAS];
        else alvos = [selecionado];
        const fator = (selecionado === 'todos_status' || STATS.includes(selecionado)) ? FATOR_EXIBICAO_STATUS : 1;
        const v = { base: (parseInt(campos.base) || 0) * fator, mBase: parseFloat(campos.mBase) || 1, regen: limitarRegeneracaoPct(campos.regeneracao) };
        updateFicha((f) => {
            const vitais = alvos.filter(c => ['vida', 'mana', 'aura', 'chakra', 'corpo', 'pontosVitais', 'pontosMortais'].includes(c));
            // Guarda o "atual" proporcional: editar a Base nunca zera a Vida/Energia que sobrou.
            const antes = vitais.length > 0 ? capturarMaximosAtuais(f, vitais) : null;
            alvos.forEach(c => {
                if (!f[c]) f[c] = {};
                f[c].base = v.base; f[c].mBase = v.mBase; f[c].regeneracaoPct = v.regen; f[c].regeneracao = 0;
            });
            if (vitais.length > 0) rescalarVitaisProporcional(f, antes, vitais);
        });
        callSave();
        setSalvo(true);
        setTimeout(() => setSalvo(false), 2000);
    }, [selecionado, campos, updateFicha, callSave]);

    const chaveBuff = selecionado === 'todos_status' ? 'forca' : selecionado === 'todas_energias' ? 'mana' : selecionado;
    const buffs = ficha ? getBuffs(ficha, chaveBuff) : null;

    return (
        <section className="ajustes-bloco">
            <h2 className="ajustes-titulo">📐 Editor de Atributos</h2>
            <select className="ajustes-input" value={selecionado} onChange={(e) => setSelecionado(e.target.value)} aria-label="Atributo a editar">
                {ATRIBUTO_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <div className="ajustes-grade">
                <label className="ajustes-campo">Base
                    <input className="ajustes-input" type="number" value={campos.base} onChange={e => alterarCampo('base', e.target.value)} />
                </label>
                <label className="ajustes-campo">Mult Base {buffs && <Buff valor={buffs.mbase} ativo={buffs._hasBuff.mbase} />}
                    <input className="ajustes-input" type="number" step="0.01" value={campos.mBase} onChange={e => alterarCampo('mBase', e.target.value)} />
                </label>
                <label className="ajustes-campo">Regeneração (% do máx./turno)
                    <input className="ajustes-input" type="number" min="0" max="100" step="0.1" value={campos.regeneracao} onChange={e => alterarCampo('regeneracao', e.target.value)} />
                </label>
            </div>
            <button type="button" className="ajustes-salvar" onClick={salvar}>{salvo ? 'SALVO COM SUCESSO!' : 'SALVAR ATRIBUTOS'}</button>
        </section>
    );
}

function MultiplicadoresPoder({ ficha, updateFicha, callSave }) {
    const [mult, setMult] = useState(ESTADO_MULT_VAZIO);
    const [salvo, setSalvo] = useState(false);

    useEffect(() => {
        const d = (ficha && ficha.dano) || {};
        setMult({ base: d.mBase ?? 1, potencial: d.mPotencial ?? 1, geral: d.mGeral ?? 1, formas: d.mFormas ?? 1, absoluto: d.mAbsoluto ?? 1, unico: d.mUnico ?? '1.0', danoBruto: d.danoBruto ?? 0 });
    }, [ficha?.dano]);

    const alterar = useCallback((campo, valor) => { setMult(prev => ({ ...prev, [campo]: valor })); }, []);

    const salvar = useCallback(() => {
        updateFicha((f) => {
            if (!f.dano) f.dano = {};
            f.dano.mBase = parseFloat(mult.base) || 1.0; f.dano.mPotencial = parseFloat(mult.potencial) || 1.0; f.dano.mGeral = parseFloat(mult.geral) || 1.0;
            f.dano.mFormas = parseFloat(mult.formas) || 1.0; f.dano.mAbsoluto = parseFloat(mult.absoluto) || 1.0; f.dano.mUnico = mult.unico || '1.0';
            f.dano.danoBruto = parseFloat(mult.danoBruto) || 0;
        });
        callSave();
        setSalvo(true);
        setTimeout(() => setSalvo(false), 2000);
    }, [mult, updateFicha, callSave]);

    // Sem o Grimório (ignorarPoderes): só o que entra no Poder Calculado (core/poder.js).
    const buffs = ficha ? getBuffs(ficha, 'dano', false, false, true) : { _hasBuff: {}, munico: [], fontesMgeral: [] };

    return (
        <section className="ajustes-bloco">
            <h2 className="ajustes-titulo">💥 Multiplicadores de Poder</h2>
            {/* ⚖️ Não multiplicam mais o dano: só o Poder Calculado, que decide o dano pela Disputa de Poder. */}
            <p className="ajustes-explica">Estes multiplicadores não multiplicam o dano: entram só no <strong>Poder Calculado</strong> do Scouter. No combate o dano é ajustado pela <strong>Disputa de Poder</strong>. Itens, Pactos, Passivas e Classe somam aqui automaticamente.</p>
            <div className="ajustes-grade">
                <label className="ajustes-campo">Mult Base <Buff valor={buffs.mbase} ativo={buffs._hasBuff.mbase} />
                    <input className="ajustes-input" type="number" step="0.01" value={mult.base} onChange={e => alterar('base', e.target.value)} />
                </label>
                <label className="ajustes-campo">Mult Potencial
                    <input className="ajustes-input" type="number" step="0.01" value={mult.potencial} onChange={e => alterar('potencial', e.target.value)} />
                </label>
                <label className="ajustes-campo">Mult Geral <Buff valor={buffs.mgeral} ativo={buffs._hasBuff.mgeral} />
                    <input className="ajustes-input" type="number" step="0.01" value={mult.geral} onChange={e => alterar('geral', e.target.value)} />
                    {buffs.fontesMgeral && buffs.fontesMgeral.length > 0 && (
                        <span className="ajustes-origem">
                            <strong>🔍 Origem dos Buffs:</strong>
                            {buffs.fontesMgeral.map((fonte, i) => <span key={i}>• {fonte}</span>)}
                        </span>
                    )}
                </label>
                <label className="ajustes-campo">Mult Formas <Buff valor={buffs.mformas} ativo={buffs._hasBuff.mformas} />
                    <input className="ajustes-input" type="number" step="0.01" value={mult.formas} onChange={e => alterar('formas', e.target.value)} />
                </label>
                <label className="ajustes-campo">Mult Absoluto <Buff valor={buffs.mabs} ativo={buffs._hasBuff.mabs} />
                    <input className="ajustes-input" type="number" step="0.01" value={mult.absoluto} onChange={e => alterar('absoluto', e.target.value)} />
                </label>
                <label className="ajustes-campo">Mult Único {buffs.munico.length > 0 && <span className="ajustes-buff">(Buff: x{buffs.munico.join(' e x')})</span>}
                    <input className="ajustes-input" type="text" value={mult.unico} onChange={e => alterar('unico', e.target.value)} />
                </label>
            </div>
            <label className="ajustes-campo ajustes-campo-largo">Dano Bruto Adicional (+) (acumulado de Anomalias)
                <input className="ajustes-input" type="number" step="0.01" value={mult.danoBruto} onChange={e => alterar('danoBruto', e.target.value)} />
                <span className="ajustes-origem">Soma-se diretamente à energia gasta nos seus ataques.</span>
            </label>
            <button type="button" className="ajustes-salvar" onClick={salvar}>{salvo ? 'SALVO COM SUCESSO!' : 'SALVAR MULTIPLICADORES'}</button>
        </section>
    );
}

// 🔋 Capacidade rara (Poderes, Infinities, Singularidades): liberada pelo Mestre na ficha. Habilidades podem ser
// conjuradas "como Poder" (0% de energia gasta, benefício de um Custo maior, ver core/custoPoder.js).
function CapacidadesEspeciais({ ficha, updateFicha, callSave }) {
    const alternar = useCallback((e) => {
        const liberado = e.target.checked;
        updateFicha((f) => { if (!f.combate) f.combate = {}; f.combate.conjuraComoPoder = liberado; });
        callSave();
    }, [updateFicha, callSave]);

    return (
        <section className="ajustes-bloco">
            <h2 className="ajustes-titulo">🔋 Conjurar como Poder</h2>
            <p className="ajustes-explica">Capacidade rara, vinda de Poderes, Infinities e Singularidades, e <strong>liberada pelo Mestre</strong>. Com ela, Habilidades e Técnicas Elementais podem ser conjuradas <strong>sem gastar energia (0%)</strong>, recebendo o benefício de um Custo maior (dentro da margem da habilidade) com Mana, Aura e Chakra somando no Poder do golpe. Cada habilidade pode ser vetada no próprio cadastro.</p>
            <label className="ajustes-campo como-poder-permissao">
                <span><input type="checkbox" checked={!!ficha?.combate?.conjuraComoPoder} onChange={alternar} /> Liberado para este personagem</span>
            </label>
        </section>
    );
}

export default function AjustesPanel() {
    const { ficha, updateFicha } = useFichaAtiva();
    const callSave = useCallSaveAtivo();
    if (!ficha) return null;

    return (
        <div className="ajustes-painel">
            <EditorAtributos ficha={ficha} updateFicha={updateFicha} callSave={callSave} />
            <MultiplicadoresPoder ficha={ficha} updateFicha={updateFicha} callSave={callSave} />
            <CapacidadesEspeciais ficha={ficha} updateFicha={updateFicha} callSave={callSave} />
        </div>
    );
}
