import React from 'react';
import { useArsenalForm, ARMA_TIPOS, RARIDADES, BONUS_OPTIONS } from './ArsenalFormContext';
import { ATRIBUTOS_AGRUPADOS, getPropriedadesDoAtributo, ajustarPropriedade } from '../../core/efeitos-constants';
import FormasEditor from '../shared/FormasEditor';

const FALLBACK = <div style={{ color: '#888', padding: 10 }}>Arsenal provider não encontrado</div>;

export function ArsenalFormTitle() {
    const ctx = useArsenalForm();
    if (!ctx) return FALLBACK;
    const { itemEditandoId, nomeItem } = ctx;

    return (
        <h3 style={{ color: '#ffcc00', marginBottom: 10 }} id="titulo-item-form">
            {itemEditandoId ? `Editando: ${nomeItem}` : 'Forjar Novo Equipamento'}
        </h3>
    );
}

export function ArsenalNomeInput() {
    const ctx = useArsenalForm();
    if (!ctx) return FALLBACK;
    const { nomeItem, setNomeItem } = ctx;

    return (
        <input className="input-neon" type="text" placeholder="Nome do Equipamento" value={nomeItem} onChange={e => setNomeItem(e.target.value)} />
    );
}

export function ArsenalTipoSelect() {
    const ctx = useArsenalForm();
    if (!ctx) return FALLBACK;
    const { tipoItem, setTipoItem } = ctx;

    return (
        <div>
            <label style={{ color: '#aaa', fontSize: '0.85em' }}>Tipo</label>
            <select className="input-neon" value={tipoItem} onChange={e => setTipoItem(e.target.value)}>
                <option value="arma">Arma</option>
                <option value="armadura">Armadura</option>
                <option value="artefato">Artefato</option>
            </select>
        </div>
    );
}

export function ArsenalArmaSelect() {
    const ctx = useArsenalForm();
    if (!ctx) return FALLBACK;
    const { tipoItem, armaTipo, setArmaTipo } = ctx;

    if (tipoItem !== 'arma') return null;

    return (
        <div>
            <label style={{ color: '#aaa', fontSize: '0.85em' }}>Arma</label>
            <select className="input-neon" value={armaTipo} onChange={e => setArmaTipo(e.target.value)}>
                {ARMA_TIPOS.map(a => <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>)}
            </select>
        </div>
    );
}

export function ArsenalRaridadeSelect() {
    const ctx = useArsenalForm();
    if (!ctx) return FALLBACK;
    const { raridade, setRaridade } = ctx;

    return (
        <div>
            <label style={{ color: '#aaa', fontSize: '0.85em' }}>Raridade</label>
            <select className="input-neon" value={raridade} onChange={e => setRaridade(e.target.value)}>
                {RARIDADES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
        </div>
    );
}

export function ArsenalBonusSelect() {
    const ctx = useArsenalForm();
    if (!ctx) return FALLBACK;
    const { bonusTipo, setBonusTipo, bonusValor, setBonusValor } = ctx;

    return (
        <>
            <div>
                <label style={{ color: '#aaa', fontSize: '0.85em' }}>Bonus</label>
                <select className="input-neon" value={bonusTipo} onChange={e => setBonusTipo(e.target.value)}>
                    {BONUS_OPTIONS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
            </div>
            <div>
                <label style={{ color: '#aaa', fontSize: '0.85em' }}>Valor</label>
                <input className="input-neon" type="text" value={bonusValor} onChange={e => setBonusValor(e.target.value)} />
            </div>
        </>
    );
}

export function ArsenalDadosDano() {
    const ctx = useArsenalForm();
    if (!ctx) return FALLBACK;
    const { tipoItem, armaDadosQtd, setArmaDadosQtd, armaDadosFaces, setArmaDadosFaces, armaAlcance, setArmaAlcance } = ctx;

    if (tipoItem !== 'arma') return null;

    return (
        <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Dados de Dano (qtd)</label>
                    <input className="input-neon" type="number" min="1" value={armaDadosQtd} onChange={e => setArmaDadosQtd(e.target.value)} />
                </div>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Faces (d)</label>
                    <input className="input-neon" type="number" min="1" value={armaDadosFaces} onChange={e => setArmaDadosFaces(e.target.value)} />
                </div>
                <div>
                    <label style={{ color: '#00ffcc', fontSize: '0.85em', fontWeight: 'bold' }}>Alcance (Quadrados)</label>
                    <input className="input-neon" type="number" min="1" step="0.5" value={armaAlcance} onChange={e => setArmaAlcance(e.target.value)} style={{ borderColor: '#00ffcc', color: '#00ffcc' }} />
                </div>
            </div>
            <p style={{ color: '#0f0', fontSize: '0.85em', margin: '5px 0 0' }}>Dano da Arma: {armaDadosQtd}d{armaDadosFaces}</p>
        </>
    );
}

export function ArsenalEfeitosAtivos() {
    const ctx = useArsenalForm();
    if (!ctx) return FALLBACK;
    const { tipoItem, nomeEfeito, setNomeEfeito, novoAtr, setNovoAtr, novoProp, setNovoProp, novoVal, setNovoVal, efeitosTempArsenal, addEfeitoTemp, removerEfeitoTemp } = ctx;

    if (tipoItem !== 'arma') return null;

    return (
        <>
            <input className="input-neon" type="text" placeholder="Nome do Efeito" value={nomeEfeito} onChange={e => setNomeEfeito(e.target.value)} style={{ marginTop: 10 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginTop: 5 }}>
                <select className="input-neon" value={novoAtr} onChange={e => { setNovoAtr(e.target.value); setNovoProp(ajustarPropriedade(e.target.value, novoProp)); }}>
                    {ATRIBUTOS_AGRUPADOS.map(grupo => (
                        <optgroup key={grupo.label} label={grupo.label} style={{ background: '#051010', color: '#0ff' }}>
                            {grupo.options.map(a => <option key={a} value={a}>{a.replace('_', ' ').toUpperCase()}</option>)}
                        </optgroup>
                    ))}
                </select>
                <select className="input-neon" value={novoProp} onChange={e => setNovoProp(e.target.value)}>
                    {getPropriedadesDoAtributo(novoAtr).map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                </select>
                <input className="input-neon" type="text" placeholder="Valor" value={novoVal} onChange={e => setNovoVal(e.target.value)} />
                <button className="btn-neon btn-blue" onClick={addEfeitoTemp} style={{ padding: '5px 10px' }}>+ Efeito</button>
            </div>

            <div style={{ marginTop: 10 }}>
                {efeitosTempArsenal.length === 0 ? (
                    <p style={{ color: '#888', fontSize: '0.9em', margin: 0 }}>Nenhum efeito adicionado.</p>
                ) : (
                    efeitosTempArsenal.map((e, i) => {
                        if (!e) return null;
                        const prop = (e.propriedade || '').toLowerCase();
                        const isMult = ['mbase', 'mgeral', 'mformas', 'mabs', 'munico'].includes(prop);
                        return (
                            <div key={i} style={{ color: '#0ff', fontSize: '0.9em', marginBottom: 5, background: 'rgba(0,255,255,0.1)', padding: '5px 10px', borderLeft: '2px solid #0ff', display: 'flex', justifyContent: 'space-between' }}>
                                <span><strong style={{ color: '#fff' }}>{e.nome || '(Sem nome)'}</strong> [{(e.atributo || '').replace('_', ' ').toUpperCase()}] {(e.propriedade || '').toUpperCase()}: <strong style={{ color: '#ffcc00' }}>{isMult ? '(x)' : '(+)'} {e.valor || 0}</strong></span>
                                <button onClick={() => removerEfeitoTemp(i)} style={{ background: 'transparent', color: '#f00', border: 'none', cursor: 'pointer' }}>X</button>
                            </div>
                        );
                    })
                )}
            </div>
        </>
    );
}

export function ArsenalEfeitosPassivos() {
    const ctx = useArsenalForm();
    if (!ctx) return FALLBACK;
    const { tipoItem, nomeEfeitoPassivo, setNomeEfeitoPassivo, novoAtrPassivo, setNovoAtrPassivo, novoPropPassivo, setNovoPropPassivo, novoValPassivo, setNovoValPassivo, efeitosTempPassivosArsenal, addEfeitoPassivoTemp, removerEfeitoPassivoTemp } = ctx;

    if (tipoItem !== 'arma') return null;

    return (
        <>
            <h4 style={{ color: '#f0f', marginTop: 15, marginBottom: 8, fontSize: '0.95em' }}>Efeitos Passivos</h4>
            <input className="input-neon" type="text" placeholder="Nome do Efeito Passivo" value={nomeEfeitoPassivo} onChange={e => setNomeEfeitoPassivo(e.target.value)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginTop: 5 }}>
                <select className="input-neon" value={novoAtrPassivo} onChange={e => { setNovoAtrPassivo(e.target.value); setNovoPropPassivo(ajustarPropriedade(e.target.value, novoPropPassivo)); }}>
                    {ATRIBUTOS_AGRUPADOS.map(grupo => (
                        <optgroup key={grupo.label} label={grupo.label} style={{ background: '#051010', color: '#f0f' }}>
                            {grupo.options.map(a => <option key={a} value={a}>{a.replace('_', ' ').toUpperCase()}</option>)}
                        </optgroup>
                    ))}
                </select>
                <select className="input-neon" value={novoPropPassivo} onChange={e => setNovoPropPassivo(e.target.value)}>
                    {getPropriedadesDoAtributo(novoAtrPassivo).map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                </select>
                <input className="input-neon" type="text" placeholder="Valor" value={novoValPassivo} onChange={e => setNovoValPassivo(e.target.value)} />
                <button className="btn-neon" style={{ padding: '5px 10px', borderColor: '#f0f', color: '#f0f' }} onClick={addEfeitoPassivoTemp}>+ Passivo</button>
            </div>

            <div style={{ marginTop: 10 }}>
                {efeitosTempPassivosArsenal.length === 0 ? (
                    <p style={{ color: '#888', fontSize: '0.9em', margin: 0 }}>Nenhum efeito passivo adicionado.</p>
                ) : (
                    efeitosTempPassivosArsenal.map((e, i) => {
                        if (!e) return null;
                        const prop = (e.propriedade || '').toLowerCase();
                        const isMult = ['mbase', 'mgeral', 'mformas', 'mabs', 'munico'].includes(prop);
                        return (
                            <div key={i} style={{ color: '#f0f', fontSize: '0.9em', marginBottom: 5, background: 'rgba(255,0,255,0.1)', padding: '5px 10px', borderLeft: '2px solid #f0f', display: 'flex', justifyContent: 'space-between' }}>
                                <span>PASSIVO: <strong style={{ color: '#fff' }}>{e.nome || '(Sem nome)'}</strong> [{(e.atributo || '').replace('_', ' ').toUpperCase()}] {(e.propriedade || '').toUpperCase()}: <strong style={{ color: '#ffcc00' }}>{isMult ? '(x)' : '(+)'} {e.valor || 0}</strong></span>
                                <button onClick={() => removerEfeitoPassivoTemp(i)} style={{ background: 'transparent', color: '#f00', border: 'none', cursor: 'pointer' }}>X</button>
                            </div>
                        );
                    })
                )}
            </div>
        </>
    );
}

export function ArsenalForjarButton() {
    const ctx = useArsenalForm();
    if (!ctx) return FALLBACK;
    const { itemEditandoId, salvarNovoItem, cancelarEdicaoItem } = ctx;

    return (
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button className="btn-neon btn-gold" onClick={salvarNovoItem} style={{ flex: 1 }}>
                {itemEditandoId ? 'Salvar Edicao' : 'Forjar Equipamento'}
            </button>
            {itemEditandoId && (
                <button className="btn-neon btn-red" onClick={cancelarEdicaoItem} style={{ flex: 1 }}>
                    Cancelar
                </button>
            )}
        </div>
    );
}

export function ArsenalInventarioList() {
    const ctx = useArsenalForm();
    if (!ctx) return FALLBACK;
    const { inventario, toggleEquiparItem, editarItem, deletarItem, salvarFormaItem, deletarFormaItem, ativarFormaItem } = ctx;

    return (
        <div id="lista-inventario-salvos" style={{ marginTop: 15 }}>
            {inventario.length === 0 ? (
                <p style={{ color: '#888' }}>Nenhum equipamento na sua forja.</p>
            ) : (
                inventario.map((p) => {
                    if (!p) return null;
                    const isEquipped = p.equipado;
                    const c = isEquipped ? '#ffcc00' : '#888';
                    const bg = isEquipped ? 'rgba(255,204,0,0.1)' : 'rgba(0,0,0,0.4)';
                    const icon = p.tipo === 'arma' ? '\u2694\uFE0F' : p.tipo === 'armadura' ? '\uD83D\uDEE1\uFE0F' : '\uD83D\uDD2E';

                    const bTipo = p.bonusTipo || '';
                    const isMult = bTipo.includes('mult_');
                    const prefixo = isMult ? 'x' : '+';
                    const propText = bTipo.replace('_', ' ').toUpperCase();

                    return (
                        <div key={p.id} className="def-box" style={{ borderLeft: `5px solid ${c}`, background: bg, marginBottom: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 15 }}>
                                <div>
                                    <h3 style={{ margin: 0, color: c, textShadow: `0 0 10px ${c}` }}>
                                        {icon} {p.nome || 'Item'}
                                    </h3>
                                    <p style={{ color: '#aaa', fontSize: '0.85em', margin: '5px 0 0' }}>
                                        {(p.tipo || '').toUpperCase()}{p.armaTipo ? ` (${p.armaTipo.charAt(0).toUpperCase() + p.armaTipo.slice(1)})` : ''}{p.raridade ? ` | ${(p.raridade || '').charAt(0).toUpperCase() + (p.raridade || '').slice(1)}` : ''}{p.tipo === 'arma' && p.dadosQtd ? ` | Dano: ${p.dadosQtd}d${p.dadosFaces || 20}` : ''}{p.tipo === 'arma' ? ` | Alcance: ${p.alcance || 1}Q` : ''}
                                    </p>
                                    <p style={{ color: '#0ff', fontSize: '0.9em', margin: '5px 0 0' }}>
                                        {propText}: <strong style={{ color: '#ffcc00' }}>{prefixo}{p.bonusValor || 0}</strong>
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <button className="btn-neon" style={{ borderColor: c, color: c, padding: '5px 15px', fontSize: '1.1em', margin: 0 }} onClick={() => toggleEquiparItem(p.id)}>
                                        {isEquipped ? 'EQUIPADO' : 'GUARDADO'}
                                    </button>
                                    <button className="btn-neon btn-blue" style={{ padding: '5px 15px', fontSize: '1em', margin: 0 }} onClick={() => editarItem(p.id)}>EDITAR</button>
                                    <button className="btn-neon btn-red" style={{ padding: '5px 15px', fontSize: '1em', margin: 0 }} onClick={() => deletarItem(p.id)}>APAGAR</button>
                                </div>
                            </div>
                            {p.tipo === 'arma' && (
                                <FormasEditor
                                    itemRaridade={p.raridade}
                                    formas={p.formas || []}
                                    formaAtivaId={p.formaAtivaId || null}
                                    configAtivaId={p.configAtivaId || null}
                                    onSalvarForma={(forma) => salvarFormaItem(p.id, forma)}
                                    onDeletarForma={(formaId) => deletarFormaItem(p.id, formaId)}
                                    onAtivarForma={(formaId, configId) => ativarFormaItem(p.id, formaId, configId)}
                                />
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}
