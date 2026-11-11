import React, { useState, useCallback } from 'react';
import useStore from '../../stores/useStore';
import { useFichaAtiva, useCallSaveAtivo } from './FichaAlvoContext';
import {
    listaDeContadores, adicionarContador, atualizarContador, mudarContador, removerContador,
    nomeDoPoderDoContador, referenciasDoContador, LIMITE_CONTADORES, RESETS_CONTADOR,
} from '../../core/contadores';

const FORM_VAZIO = { nome: '', min: '0', max: '5', reset: 'permanente' };

// 🔢 Resumo dos Contadores na aba Ficha (página 1, logo abaixo das Ações de Turno): todos os contadores da ficha ativa,
// com o nome do poder dono. Sem contador, só aparece o link "🔢 Contadores" (clique para criar um avulso).
// Dono da ficha e Mestre (na ficha que está vendo) editam; os contadores de um poder são criados no formulário do poder.
export default function ContadoresResumo() {
    const { ficha, updateFicha, souEuMesmo } = useFichaAtiva();
    const isMestre = useStore(s => s.isMestre);
    const salvar = useCallSaveAtivo();
    const [aberto, setAberto] = useState(false);
    const [editandoId, setEditandoId] = useState(null); // 'novo' ou id
    const [form, setForm] = useState(FORM_VAZIO);

    const aplicar = useCallback((fn) => { updateFicha(f => { fn(f); }); salvar(); }, [updateFicha, salvar]);

    if (!ficha) return null;
    const podeEditar = souEuMesmo || isMestre;
    const contadores = listaDeContadores(ficha);
    if (contadores.length === 0 && !aberto) {
        return (
            <div className="contadores-resumo">
                <button type="button" className="contadores-resumo-link" onClick={() => setAberto(true)}>🔢 Contadores</button>
            </div>
        );
    }

    const abrirForm = (c) => {
        if (c) setForm({ nome: c.nome, min: String(c.min), max: String(c.max), reset: c.reset === 'cena' ? 'cena' : 'permanente' });
        else setForm(FORM_VAZIO);
        setEditandoId(c ? c.id : 'novo');
    };
    const fecharForm = () => { setEditandoId(null); setForm(FORM_VAZIO); };
    const confirmar = () => {
        const patch = { nome: form.nome, min: form.min, max: form.max, reset: form.reset === 'cena' ? 'cena' : undefined };
        if (editandoId === 'novo') {
            // Limite de contadores: confere antes de gravar (adicionarContador devolve false e não altera nada).
            if (contadores.length >= LIMITE_CONTADORES) { window.alert(`A ficha só comporta ${LIMITE_CONTADORES} contadores. Remova algum antes de adicionar outro.`); return; }
            aplicar(f => { adicionarContador(f, { nome: form.nome || 'Contador', min: form.min, max: form.max, reset: patch.reset }); });
        } else aplicar(f => { atualizarContador(f, editandoId, patch); });
        fecharForm();
    };
    // Remove só o contador. Os gatilhos dos poderes que o citam NÃO são apagados por aqui (só avisados); a limpeza deles é feita no formulário do poder.
    const remover = (c) => {
        const usos = [];
        (ficha.poderes || []).forEach((po) => { if (po) referenciasDoContador(po, c.id).forEach(g => usos.push(`"${g.nome || 'gatilho'}" (${po.nome || 'poder'})`)); });
        const aviso = usos.length > 0
            ? `O contador "${c.nome}" é usado por: ${usos.join(', ')}. Esses gatilhos vão parar de funcionar até você escolher outro contador neles. Remover mesmo assim?`
            : `Remover o contador "${c.nome}"?`;
        if (!window.confirm(aviso)) return;
        aplicar(f => { removerContador(f, c.id); });
    };

    const formulario = (
        <div className="contador-linha">
            <input className="input-neon contador-nome" aria-label="Nome do contador" placeholder="Nome" maxLength={40} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
            <label className="contador-limite">mín <input className="input-neon estados-golpe-num" type="number" aria-label="Mínimo do contador" value={form.min} onChange={e => setForm({ ...form, min: e.target.value })} /></label>
            <label className="contador-limite">máx <input className="input-neon estados-golpe-num" type="number" aria-label="Máximo do contador" value={form.max} onChange={e => setForm({ ...form, max: e.target.value })} /></label>
            <select className="input-neon" aria-label="Reinício do contador" value={form.reset} onChange={e => setForm({ ...form, reset: e.target.value })}>
                {RESETS_CONTADOR.map(r => <option key={r.id} value={r.id}>{r.rotulo}</option>)}
            </select>
            <button type="button" className="descricoes-ataque-adicionar" onClick={confirmar}>{editandoId === 'novo' ? 'Adicionar' : 'Salvar'}</button>
            <button type="button" className="combo-mini" onClick={fecharForm}>Cancelar</button>
        </div>
    );

    return (
        <div className="contadores-resumo">
            <div className="contadores-resumo-corpo">
                <div className="contadores-resumo-titulo">
                    <span>🔢 Contadores</span>
                    {contadores.length === 0 && <button type="button" className="combo-mini" onClick={() => { setAberto(false); fecharForm(); }}>Fechar</button>}
                </div>
                {contadores.length === 0 && <div className="contador-vazio">Nenhum contador. Os de um poder se criam no formulário do poder (Grimório).</div>}
                {contadores.map(c => (
                    editandoId === c.id ? <React.Fragment key={c.id}>{formulario}</React.Fragment> : (
                        <div key={c.id} className="contador-linha">
                            <strong className="contador-nome-texto">{c.nome}</strong>
                            {nomeDoPoderDoContador(ficha, c) && <span className="contador-ficha-poder">de {nomeDoPoderDoContador(ficha, c)}</span>}
                            {podeEditar && <button type="button" className="combo-mini" aria-label={`Diminuir ${c.nome}`} onClick={() => aplicar(f => { mudarContador(f, c.id, -1); })} disabled={c.valor <= c.min}>−</button>}
                            <strong className="contador-valor" aria-label={`Valor de ${c.nome}`}>{c.valor}/{c.max}</strong>
                            {podeEditar && <button type="button" className="combo-mini" aria-label={`Aumentar ${c.nome}`} onClick={() => aplicar(f => { mudarContador(f, c.id, 1); })} disabled={c.valor >= c.max}>+</button>}
                            {podeEditar && <button type="button" className="combo-mini" aria-label={`Editar o contador ${c.nome}`} onClick={() => abrirForm(c)}>✎</button>}
                            {podeEditar && <button type="button" className="combo-mini" aria-label={`Remover o contador ${c.nome}`} onClick={() => remover(c)}>✕</button>}
                        </div>
                    )
                ))}
                {podeEditar && editandoId === 'novo' && formulario}
                {podeEditar && editandoId === null && contadores.length < LIMITE_CONTADORES && (
                    <button type="button" className="descricoes-ataque-adicionar" onClick={() => abrirForm(null)}>+ Contador avulso</button>
                )}
            </div>
        </div>
    );
}
