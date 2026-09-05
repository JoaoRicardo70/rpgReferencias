import React, { useState } from 'react';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';
import { capturarMaximosAtuais, rescalarVitaisProporcional } from '../../core/vitals';
import { ATRIBUTOS_AGRUPADOS, PROPRIEDADE_OPTIONS } from '../../core/efeitos-constants';
import { CLASSES_OPTIONS } from '../ficha/FichaFormContext';
import FormasEditor from '../shared/FormasEditor';

// ==========================================
// 👁️ REINO INTERIOR — PACTOS, ESPÍRITOS & ENTIDADES SELADAS
// Mesmo formato de dado de app/src/components/ficha/FichaFormContext.jsx
// (ficha.seresSelados), pra que o motor de Poder (core/attributes.js) já
// aplique os Buffs Ativos/Passivos e as Formas Místicas automaticamente,
// sem precisar de nenhuma mudança no core.
// ==========================================

// 🔥 "PODER DIRETO" aumenta o Poder Calculado do Scouter diretamente (core/poder.js
// > getPoderDiretoMultiplier), sem passar por nenhum Status/Energia/Vida — mesmo
// grupo extra que já existe só pra Poderes Clássicos (PoderesSubComponents.jsx).
// Fica de fora de ATRIBUTOS_AGRUPADOS (a lista compartilhada) de propósito: só
// ficha.poderes e ficha.seresSelados são lidos por getPoderDiretoMultiplier, então
// oferecer essa opção em Arsenal/Formas criaria um buff que pareceria funcionar
// na UI mas nunca faria nada.
const ATRIBUTOS_PACTOS = [
    ...ATRIBUTOS_AGRUPADOS,
    { label: '⚡ POTÊNCIA DO SCOUTER', options: ['poder_direto'] }
];

const CampoMagico = ({ valor, onChange, onBlur, placeholder, styleExtra = {}, type = "text" }) => (
    <input
        type={type} value={valor || ''} onChange={e => onChange(e.target.value)}
        onBlur={onBlur} placeholder={placeholder}
        style={{ background: 'transparent', border: 'none', borderBottom: '1px dashed currentColor', fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit', fontWeight: 'inherit', fontStyle: 'inherit', outline: 'none', padding: '5px', width: '100%', ...styleExtra }}
    />
);

const AreaMagica = ({ valor, onChange, onBlur, placeholder, styleExtra = {} }) => (
    <textarea
        value={valor || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        onBlur={onBlur}
        style={{ width: '100%', minHeight: '60px', background: 'transparent', border: 'none', borderBottom: '2px dotted currentColor', color: 'inherit', fontFamily: 'inherit', padding: '8px', outline: 'none', resize: 'vertical', whiteSpace: 'pre-wrap', ...styleExtra }}
    />
);

const estadoInicialDraft = { nome: '', descricao: '', elemento: '', classe: '', zeraCusto: false, efeitos: [], efeitosPassivos: [] };

// 🔥 Definido FORA do PactosPanel de propósito: um componente redefinido a cada
// render (dentro do corpo de outro componente) faz o React desmontar e remontar
// toda a subárvore a cada tecla digitada, derrubando o foco do campo de texto e
// embaralhando a digitação — por isso recebe addEfeito/removeEfeito por prop.
const EditorEfeitos = ({ titulo, cor, isAtivo, draftBuffs, novo, setNovo, addEfeito, removeEfeito }) => (
    <div style={{ marginBottom: 15 }}>
        <h5 style={{ color: cor, margin: '0 0 5px 0', fontSize: '0.85em' }}>{titulo}</h5>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 70px auto', gap: 5, marginBottom: 8 }}>
            <CampoMagico valor={novo.nome} onChange={v => setNovo(n => ({ ...n, nome: v }))} placeholder="Nome do Efeito" styleExtra={{ fontSize: '0.85em' }} />
            <select value={novo.atributo} onChange={e => setNovo(n => ({ ...n, atributo: e.target.value }))} style={{ background: 'transparent', color: 'inherit', border: 'none', borderBottom: '1px dashed currentColor', outline: 'none', fontFamily: 'inherit', fontSize: '0.85em' }}>
                {ATRIBUTOS_PACTOS.map(g => <optgroup key={g.label} label={g.label} style={{ color: '#000' }}>{g.options.map(a => <option key={a} value={a} style={{ color: '#000' }}>{a.replace('_', ' ').toUpperCase()}</option>)}</optgroup>)}
            </select>
            <select value={novo.propriedade} onChange={e => setNovo(n => ({ ...n, propriedade: e.target.value }))} style={{ background: 'transparent', color: 'inherit', border: 'none', borderBottom: '1px dashed currentColor', outline: 'none', fontFamily: 'inherit', fontSize: '0.85em' }}>
                {PROPRIEDADE_OPTIONS.map(p => <option key={p} value={p} style={{ color: '#000' }}>{p.toUpperCase()}</option>)}
            </select>
            <CampoMagico valor={novo.valor} onChange={v => setNovo(n => ({ ...n, valor: v }))} placeholder="Valor" styleExtra={{ fontSize: '0.85em', textAlign: 'center' }} />
            <button onClick={() => addEfeito(isAtivo)} style={{ background: 'transparent', border: `1px solid ${cor}`, color: cor, cursor: 'pointer', fontWeight: 'bold', borderRadius: 4 }}>+</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {draftBuffs.map((e, i) => (
                <div key={i} style={{ fontSize: '0.75em', color: cor, background: 'rgba(0,0,0,0.06)', padding: '4px 8px', borderRadius: 4, border: `1px solid ${cor}`, display: 'flex', gap: 5, alignItems: 'center' }}>
                    <span>{e.nome}: [{e.atributo}] {e.propriedade}: +{e.valor}</span>
                    <button onClick={() => removeEfeito(isAtivo, i)} style={{ background: 'none', border: 'none', color: '#ff003c', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
                </div>
            ))}
        </div>
    </div>
);

export default function PactosPanel() {
    const minhaFicha = useStore(s => s.minhaFicha);
    const updateFicha = useStore(s => s.updateFicha);
    const callSave = () => salvarFichaSilencioso();

    const seresSelados = minhaFicha?.seresSelados || [];
    const [editandoId, setEditandoId] = useState(null);
    const [draft, setDraft] = useState(estadoInicialDraft);
    const [novoAtivo, setNovoAtivo] = useState({ nome: '', atributo: 'forca', propriedade: 'base', valor: '' });
    const [novoPassivo, setNovoPassivo] = useState({ nome: '', atributo: 'forca', propriedade: 'base', valor: '' });

    const setCampoDraft = (campo, valor) => setDraft(d => ({ ...d, [campo]: valor }));

    const cancelarEdicao = () => { setEditandoId(null); setDraft(estadoInicialDraft); setNovoAtivo({ nome: '', atributo: 'forca', propriedade: 'base', valor: '' }); setNovoPassivo({ nome: '', atributo: 'forca', propriedade: 'base', valor: '' }); };

    const addEfeito = (isAtivo) => {
        const rascunho = isAtivo ? novoAtivo : novoPassivo;
        if (!rascunho.nome.trim() || rascunho.valor === '') { alert('Preencha o nome e o valor do efeito!'); return; }
        const chave = isAtivo ? 'efeitos' : 'efeitosPassivos';
        setDraft(d => ({ ...d, [chave]: [...d[chave], { nome: rascunho.nome.trim(), atributo: rascunho.atributo, propriedade: rascunho.propriedade, valor: rascunho.valor }] }));
        if (isAtivo) setNovoAtivo({ nome: '', atributo: 'forca', propriedade: 'base', valor: '' });
        else setNovoPassivo({ nome: '', atributo: 'forca', propriedade: 'base', valor: '' });
    };

    const removeEfeito = (isAtivo, index) => {
        const chave = isAtivo ? 'efeitos' : 'efeitosPassivos';
        setDraft(d => ({ ...d, [chave]: d[chave].filter((_, i) => i !== index) }));
    };

    const salvarPacto = () => {
        if (!draft.nome.trim()) { alert('Dê um nome à entidade/pacto!'); return; }
        updateFicha(f => {
            if (!f.seresSelados) f.seresSelados = [];
            if (editandoId) {
                const s = f.seresSelados.find(x => x.id === editandoId);
                if (s) {
                    s.nome = draft.nome; s.descricao = draft.descricao; s.elemento = draft.elemento; s.classe = draft.classe; s.zeraCusto = draft.zeraCusto;
                    s.efeitos = [...draft.efeitos]; s.efeitosPassivos = [...draft.efeitosPassivos];
                }
            } else {
                f.seresSelados.push({
                    id: Date.now().toString(), nome: draft.nome, descricao: draft.descricao, elemento: draft.elemento, classe: draft.classe, zeraCusto: draft.zeraCusto, ativo: false,
                    efeitos: [...draft.efeitos], efeitosPassivos: [...draft.efeitosPassivos], formas: [], formaAtivaId: null, configAtivaId: null
                });
            }
        });
        callSave();
        cancelarEdicao();
    };

    const editarPacto = (id) => {
        const s = seresSelados.find(x => x.id === id);
        if (!s) return;
        if (s.ativo) { alert('Desative a sincronização do Pacto antes de editá-lo!'); return; }
        setEditandoId(s.id);
        setDraft({ nome: s.nome, descricao: s.descricao || '', elemento: s.elemento || '', classe: s.classe || '', zeraCusto: s.zeraCusto || false, efeitos: [...(s.efeitos || [])], efeitosPassivos: [...(s.efeitosPassivos || [])] });
    };

    const removerPacto = (id) => {
        if (!window.confirm('Tem certeza que deseja exilar esta entidade e quebrar o pacto?')) return;
        updateFicha(f => {
            if (!f.seresSelados) return;
            const oldM = capturarMaximosAtuais(f);
            f.seresSelados = f.seresSelados.filter(x => x.id !== id);
            rescalarVitaisProporcional(f, oldM);
        });
        callSave();
    };

    const toggleSincronizado = (id) => {
        updateFicha(f => {
            if (!f.seresSelados) return;
            const s = f.seresSelados.find(x => x.id === id);
            if (!s) return;
            const oldM = capturarMaximosAtuais(f);
            s.ativo = !s.ativo;
            rescalarVitaisProporcional(f, oldM);
        });
        callSave();
    };

    const salvarFormaSer = (serId, forma) => {
        updateFicha(f => {
            const s = (f.seresSelados || []).find(x => x.id === serId);
            if (!s) return;
            if (!s.formas) s.formas = [];
            const ix = s.formas.findIndex(x => x.id === forma.id);
            if (ix >= 0) s.formas[ix] = forma; else s.formas.push(forma);
        });
        callSave();
    };

    const deletarFormaSer = (serId, formaId) => {
        if (!window.confirm('Deseja apagar esta forma/modo do Pacto?')) return;
        updateFicha(f => {
            const s = (f.seresSelados || []).find(x => x.id === serId);
            if (!s || !s.formas) return;
            const oldM = capturarMaximosAtuais(f);
            s.formas = s.formas.filter(x => x.id !== formaId);
            if (s.formaAtivaId === formaId) { s.formaAtivaId = null; s.configAtivaId = null; }
            rescalarVitaisProporcional(f, oldM);
        });
        callSave();
    };

    const ativarFormaSer = (serId, formaId, configId) => {
        updateFicha(f => {
            const s = (f.seresSelados || []).find(x => x.id === serId);
            if (!s) return;
            const oldM = capturarMaximosAtuais(f);
            const desativando = !formaId;
            s.formaAtivaId = desativando ? null : formaId;
            s.configAtivaId = desativando ? null : (configId || null);
            if (s.formaAtivaId && !s.ativo) s.ativo = true;
            rescalarVitaisProporcional(f, oldM);
        });
        callSave();
    };

    return (
        <div className="grimorio-estilo-papel fade-in" style={{ width: '100%' }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid currentColor', paddingBottom: 10, marginBottom: 20 }}>
                <h1 style={{ fontSize: '2.2em', fontStyle: 'italic', fontWeight: 'bold', margin: 0, color: '#8a2be2' }}>👁️ Reino Interior</h1>
                <p style={{ opacity: 0.8, fontSize: '0.9em', margin: '5px 0 0 0' }}>Entidades Seladas, Pactos e Espíritos — sincronize um Pacto para injetar os seus Buffs e Formas no seu Poder Calculado do Scouter.</p>
            </div>

            {seresSelados.length > 0 && (
                <div style={{ display: 'grid', gap: 15, marginBottom: 25 }}>
                    {seresSelados.map(ser => (
                        <div key={ser.id} style={{ background: 'rgba(0,0,0,0.04)', borderLeft: `4px solid ${ser.ativo ? '#00aa88' : '#999'}`, padding: 15, borderRadius: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                                <div style={{ flex: 1 }}>
                                    <h3 style={{ margin: 0, color: ser.ativo ? '#00aa88' : 'inherit', fontSize: '1.3em' }}>{ser.nome}</h3>
                                    <div style={{ color: '#8a2be2', fontSize: '0.85em', fontWeight: 'bold', marginTop: 4 }}>Domínio: {ser.elemento || 'Nenhum'} {ser.zeraCusto && <span>(Zera Custo)</span>}</div>
                                    {ser.classe && <div style={{ color: '#00aa88', fontSize: '0.85em', fontWeight: 'bold', marginTop: 2 }}>Classe Herdada: {CLASSES_OPTIONS.find(o => o.value === ser.classe)?.label || ser.classe}</div>}
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={() => toggleSincronizado(ser.id)} style={{ padding: '6px 12px', borderRadius: 4, border: `1px solid ${ser.ativo ? '#00aa88' : '#999'}`, background: ser.ativo ? '#00aa88' : 'transparent', color: ser.ativo ? '#fff' : 'inherit', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85em' }}>
                                        {ser.ativo ? '🌀 SINCRONIZADO' : 'ADORMECIDO'}
                                    </button>
                                    <button onClick={() => editarPacto(ser.id)} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>⚙️</button>
                                    <button onClick={() => removerPacto(ser.id)} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ff003c', background: 'transparent', color: '#ff003c', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
                                </div>
                            </div>

                            {ser.descricao && <p style={{ fontSize: '0.85em', marginTop: 10, fontStyle: 'italic', whiteSpace: 'pre-wrap', lineHeight: 1.4, opacity: 0.85 }}>{ser.descricao}</p>}

                            {((ser.efeitos && ser.efeitos.length > 0) || (ser.efeitosPassivos && ser.efeitosPassivos.length > 0)) && (
                                <div style={{ marginTop: 10, borderTop: '1px dashed currentColor', paddingTop: 8 }}>
                                    {ser.efeitos?.map((e, idx) => <span key={`a-${idx}`} style={{ display: 'inline-block', fontSize: '0.7em', color: '#0088aa', background: 'rgba(0,136,170,0.1)', padding: '2px 6px', borderRadius: 4, marginRight: 4, marginBottom: 4 }}>{e.nome}: +{e.valor}</span>)}
                                    {ser.efeitosPassivos?.map((e, idx) => <span key={`p-${idx}`} style={{ display: 'inline-block', fontSize: '0.7em', color: '#aa0088', background: 'rgba(170,0,136,0.1)', padding: '2px 6px', borderRadius: 4, marginRight: 4, marginBottom: 4 }}>[Pass] {e.nome}: +{e.valor}</span>)}
                                    {!ser.ativo && <div style={{ fontSize: '0.7em', opacity: 0.6, fontStyle: 'italic', marginTop: 4 }}>Sincronize o Pacto pra estes buffs entrarem no Poder Calculado.</div>}
                                </div>
                            )}

                            <div style={{ marginTop: 15, paddingTop: 10, borderTop: '1px solid currentColor' }}>
                                <h5 style={{ margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.85em', opacity: 0.8 }}>🎭 Formas / Modos de Sincronização</h5>
                                <FormasEditor
                                    formas={ser.formas || []}
                                    formaAtivaId={ser.formaAtivaId || null}
                                    configAtivaId={ser.configAtivaId || null}
                                    onSalvarForma={(forma) => salvarFormaSer(ser.id, forma)}
                                    onDeletarForma={(formaId) => deletarFormaSer(ser.id, formaId)}
                                    onAtivarForma={(formaId, configId) => ativarFormaSer(ser.id, formaId, configId)}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ background: 'rgba(0,0,0,0.03)', padding: 20, borderRadius: 8, border: '2px dashed #8a2be2' }}>
                <h2 style={{ color: '#8a2be2', margin: '0 0 15px 0', fontSize: '1.4em' }}>{editandoId ? '⚙️ Editar Entidade' : '🔗 Vincular Nova Entidade'}</h2>

                <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap', marginBottom: 10 }}>
                    <div style={{ flex: '2 1 200px' }}>
                        <label style={{ fontSize: '0.8em', opacity: 0.7 }}>Nome da Entidade</label>
                        <CampoMagico valor={draft.nome} onChange={v => setCampoDraft('nome', v)} placeholder="Ex: Kurama, Sukuna, Sylphie" />
                    </div>
                    <div style={{ flex: '1 1 150px' }}>
                        <label style={{ fontSize: '0.8em', opacity: 0.7 }}>Elemento / Essência</label>
                        <CampoMagico valor={draft.elemento} onChange={v => setCampoDraft('elemento', v)} placeholder="Ex: Vento" />
                    </div>
                    <div style={{ flex: '1 1 150px' }}>
                        <label style={{ fontSize: '0.8em', opacity: 0.7 }}>Classe (Opcional)</label>
                        <select value={draft.classe} onChange={e => setCampoDraft('classe', e.target.value)} style={{ width: '100%', background: 'transparent', color: 'inherit', border: 'none', borderBottom: '1px dashed currentColor', outline: 'none', fontFamily: 'inherit', padding: '5px' }}>
                            <option value="" style={{ color: '#000' }}>Classe (Opcional)</option>
                            {CLASSES_OPTIONS.filter(o => o.value !== '').map(o => <option key={o.value} value={o.value} style={{ color: '#000' }}>{o.label}</option>)}
                        </select>
                    </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85em', cursor: 'pointer', marginBottom: 10 }}>
                    <input type="checkbox" checked={draft.zeraCusto} onChange={e => setCampoDraft('zeraCusto', e.target.checked)} />
                    Zera custo do Elemento Base passivamente?
                </label>

                <AreaMagica valor={draft.descricao} onChange={v => setCampoDraft('descricao', v)} placeholder="História, condições do pacto, e narrativas do que acontece quando o poder dele transborda..." styleExtra={{ marginBottom: 15 }} />

                <EditorEfeitos titulo="💥 Buffs Ativos (Injetados ao Sincronizar)" cor="#0088aa" isAtivo={true} draftBuffs={draft.efeitos} novo={novoAtivo} setNovo={setNovoAtivo} addEfeito={addEfeito} removeEfeito={removeEfeito} />
                <EditorEfeitos titulo="🛡️ Buffs Passivos (Passados para a Hospedeira ao Sincronizar)" cor="#aa0088" isAtivo={false} draftBuffs={draft.efeitosPassivos} novo={novoPassivo} setNovo={setNovoPassivo} addEfeito={addEfeito} removeEfeito={removeEfeito} />

                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <button onClick={salvarPacto} style={{ flex: 1, padding: 10, borderRadius: 4, border: '2px solid #8a2be2', background: 'transparent', color: '#8a2be2', fontWeight: 'bold', cursor: 'pointer', fontSize: '1em' }}>
                        {editandoId ? '💾 SALVAR MUDANÇAS' : '+ FORJAR PACTO'}
                    </button>
                    {editandoId && <button onClick={cancelarEdicao} style={{ flex: 1, padding: 10, borderRadius: 4, border: '2px solid #ff003c', background: 'transparent', color: '#ff003c', fontWeight: 'bold', cursor: 'pointer' }}>CANCELAR</button>}
                </div>
            </div>
        </div>
    );
}
