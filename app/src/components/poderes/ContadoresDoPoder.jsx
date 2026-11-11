import React, { useState, useCallback } from 'react';
import { usePoderesForm } from './PoderesFormContext';
import { RESETS_CONTADOR, contadoresDoPoder, normalizarContadorRascunho } from '../../core/contadores';

const FORM_VAZIO = { nome: '', min: '0', max: '5', reset: 'permanente' };

const rotuloReset = (c) => (c.reset === 'cena' ? 'zera ao fim da cena' : 'permanente');

// 🔢 Bloco "Contadores deste poder" do formulário (seção Gatilhos). Os contadores ficam no RASCUNHO do poder
// e só são gravados na ficha junto com ele ao salvar (PoderesFormContext > salvarNovoPoder).
export function ContadoresDoPoderEditor() {
    const ctx = usePoderesForm();
    const [aberto, setAberto] = useState(false);
    const [editandoId, setEditandoId] = useState(null);
    const [form, setForm] = useState(FORM_VAZIO);
    const [vincularId, setVincularId] = useState('');

    const confirmar = useCallback(() => {
        if (!ctx) return;
        const patch = { nome: form.nome, min: form.min, max: form.max, reset: form.reset === 'cena' ? 'cena' : undefined };
        if (editandoId) ctx.atualizarContadorPoder(editandoId, patch);
        else if (!ctx.adicionarContadorPoder(patch)) return;
        setForm(FORM_VAZIO); setEditandoId(null); setAberto(false);
    }, [ctx, form, editandoId]);

    if (!ctx) return null;
    const { contadoresPoder = [], contadoresAvulsosDaFicha = [], limiteContadoresCheio = false, minhaFicha, poderEditandoId, removerContadorPoder, vincularContadorPoder } = ctx;
    const valoresGravados = new Map(contadoresDoPoder(minhaFicha, poderEditandoId).map(c => [String(c.id), c.valor]));

    const editar = (c) => {
        setForm({ nome: c.nome, min: String(c.min), max: String(c.max), reset: c.reset === 'cena' ? 'cena' : 'permanente' });
        setEditandoId(c.id); setAberto(true);
    };
    const cancelar = () => { setForm(FORM_VAZIO); setEditandoId(null); setAberto(false); };

    return (
        <div className="contadores-poder">
            <div className="contadores-poder-titulo">🔢 Contadores deste poder</div>
            <p className="contador-dica">Contador = marcador numérico que um poder usa para contar coisas (acertos, críticos sofridos, turnos…). Os gatilhos somam, zeram e convertem em bônus. Ex.: contador “Críticos sofridos” 0–3 + gatilho “ao sofrer crítico, soma 1”.</p>
            {contadoresPoder.length === 0 && <div className="contador-vazio">Nenhum contador neste poder.</div>}
            {contadoresPoder.map(c => (
                <div key={c.id} className="contador-linha contadores-poder-linha">
                    <strong className="contador-nome-texto">{c.nome}</strong>
                    <span className="contador-detalhe">{valoresGravados.has(String(c.id)) ? `valor ${valoresGravados.get(String(c.id))} · ` : ''}mín {c.min} · máx {c.max} · {rotuloReset(c)}</span>
                    <button type="button" className="combo-mini" aria-label={`Editar o contador ${c.nome}`} onClick={() => editar(c)}>✎</button>
                    <button type="button" className="combo-mini" aria-label={`Remover o contador ${c.nome}`} onClick={() => removerContadorPoder(c.id)}>✕</button>
                </div>
            ))}
            {aberto ? (
                <div className="contador-linha contadores-poder-form">
                    <input className="input-neon contador-nome" aria-label="Nome do contador" placeholder="Nome (ex.: Críticos sofridos)" maxLength={40} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
                    <label className="contador-limite">mín <input className="input-neon estados-golpe-num" type="number" aria-label="Mínimo do contador" value={form.min} onChange={e => setForm({ ...form, min: e.target.value })} /></label>
                    <label className="contador-limite">máx <input className="input-neon estados-golpe-num" type="number" aria-label="Máximo do contador" value={form.max} onChange={e => setForm({ ...form, max: e.target.value })} /></label>
                    <select className="input-neon" aria-label="Reinício do contador" value={form.reset} onChange={e => setForm({ ...form, reset: e.target.value })}>
                        {RESETS_CONTADOR.map(r => <option key={r.id} value={r.id}>{r.rotulo}</option>)}
                    </select>
                    <button type="button" className="descricoes-ataque-adicionar" onClick={confirmar}>{editandoId ? 'Salvar contador' : 'Adicionar contador'}</button>
                    <button type="button" className="combo-mini" onClick={cancelar}>Cancelar</button>
                </div>
            ) : (
                <button type="button" className="descricoes-ataque-adicionar" disabled={limiteContadoresCheio} onClick={() => setAberto(true)}>+ Contador</button>
            )}
            {limiteContadoresCheio && <div className="contador-aviso">A ficha chegou ao limite de contadores. Remova algum para criar outro.</div>}
            {contadoresAvulsosDaFicha.length > 0 && (
                <div className="contador-linha contadores-poder-vincular">
                    <select className="input-neon" aria-label="Contador existente da ficha" value={vincularId} onChange={e => setVincularId(e.target.value)}>
                        <option value="">Vincular um contador existente da ficha…</option>
                        {contadoresAvulsosDaFicha.map(c => <option key={String(c.id)} value={String(c.id)}>{c.nome} ({c.min}–{c.max})</option>)}
                    </select>
                    <button type="button" className="combo-mini" disabled={!vincularId} onClick={() => { if (vincularContadorPoder(vincularId)) setVincularId(''); }}>Vincular</button>
                </div>
            )}
        </div>
    );
}

// Fichas pequenas dos contadores do poder no cartão da lista: nome, valor/máx e −/+.
export function ContadoresNoCartao({ poder }) {
    const ctx = usePoderesForm();
    if (!ctx) return null;
    const lista = contadoresDoPoder(ctx.minhaFicha, poder.id);
    if (lista.length === 0) return null;
    return (
        <div className="contadores-cartao" aria-label={`Contadores de ${poder.nome}`}>
            {lista.map(c => (
                <span key={c.id} className="contador-ficha">
                    <span className="contador-ficha-nome">{c.nome}</span>
                    {ctx.podeEditarContadores && <button type="button" className="combo-mini" aria-label={`Diminuir ${c.nome}`} onClick={() => ctx.mudarContadorDoPoder(c.id, -1)} disabled={c.valor <= c.min}>−</button>}
                    <strong className="contador-valor" aria-label={`Valor de ${c.nome}`}>{c.valor}/{c.max}</strong>
                    {ctx.podeEditarContadores && <button type="button" className="combo-mini" aria-label={`Aumentar ${c.nome}`} onClick={() => ctx.mudarContadorDoPoder(c.id, 1)} disabled={c.valor >= c.max}>+</button>}
                </span>
            ))}
        </div>
    );
}
