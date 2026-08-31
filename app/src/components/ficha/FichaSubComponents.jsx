import React from 'react';
import { useFichaForm, ATRIBUTO_OPTIONS, CLASSES_OPTIONS, STATS, ENERGIAS } from './FichaFormContext';
import FormasEditor from '../shared/FormasEditor';

const FALLBACK = <div style={{ color: '#888', padding: 10 }}>Ficha provider não encontrado</div>;

const PROPRIEDADE_OPTIONS = [
    { val: 'base', lbl: 'Valor Bruto (+)' },
    { val: 'mbase', lbl: 'Mult Base (x)' },
    { val: 'mgeral', lbl: 'Mult Geral (x)' },
    { val: 'mformas', lbl: 'Mult Formas (x)' },
    { val: 'mabs', lbl: 'Mult Absoluto (x)' },
    { val: 'munico', lbl: 'Mult Único (x)' },
    { val: 'furia_berserker', lbl: 'Fúria Berserker (x)' },
    { val: 'reducaocusto', lbl: 'Redução Custo (%)' },
    { val: 'regeneracao', lbl: 'Regeneração' },
    { val: 'elemento_inato', lbl: 'Inato (Zera Custo Elementos)' } 
];

function renderBuffHolograma(rawVal, buffVal, hasBuff, isMult = false) {
    if (isMult && !hasBuff) return null;
    if (!isMult && !buffVal) return null;
    let v = parseFloat(rawVal);
    if (isNaN(v)) v = isMult ? 1.0 : 0;
    let total = isMult ? ((v === 1.0 ? 0 : v) + buffVal) : (v + buffVal);
    return (
        <div style={{ fontSize: '0.75em', color: '#0f0', marginTop: '4px', textShadow: '0 0 5px rgba(0,255,0,0.5)' }}>
            ↳ Buff Ativo: <b>+{buffVal}</b> ➔ Efetivo: <b style={{color: '#fff'}}>{total}</b>
        </div>
    );
}

export function FichaBioGroup() {
    const ctx = useFichaForm();
    if (!ctx) return FALLBACK;
    const {
        minhaFicha, isGrand, grandIcone, classe, mesa, setMesa, comitarBio,
        raca, setRaca, setClasse, subClasse, setSubClasse, alterEgoSlot1, alterEgoSerId, setAlterEgoSlot1, setAlterEgoSerId, mudarSubClasseDireto,
        descansoLongoPretender, classesMemorizadas, toggleMemoriaPretender,
        idade, setIdade, fisico, setFisico, sangue, setSangue,
        alinhamento, setAlinhamento, afiliacao, setAfiliacao,
        dinheiro, setDinheiro, salvandoBio, salvarBio
    } = ctx;

    if (!minhaFicha) return <div style={{ color: '#aaa', textAlign: 'center' }}>Carregando ficha...</div>;

    const seresComClasse = (minhaFicha.seresSelados || []).filter(s => s.classe);

    return (
        <div className="def-box" style={{ position: 'relative', overflow: 'hidden', border: isGrand ? '2px solid #ff003c' : '', boxShadow: isGrand ? '0 0 30px rgba(255, 0, 60, 0.3), inset 0 0 50px rgba(255, 204, 0, 0.1)' : '' }}>
            {isGrand && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(135deg, rgba(255,0,60,0.25) 0%, rgba(255,204,0,0.1) 40%, rgba(0,0,0,0) 100%)', pointerEvents: 'none' }} />}
            <h3 style={{ color: isGrand ? '#ffcc00' : '#ffcc00', marginBottom: 15, display: 'flex', alignItems: 'center', gap: '10px', textShadow: isGrand ? '0 0 10px #ffcc00' : 'none' }}>
                Ficha Narrativa {isGrand && <span style={{ fontSize: '0.6em', background: 'linear-gradient(90deg, #ffcc00, #ff003c)', color: '#000', padding: '4px 10px', borderRadius: '15px', fontWeight: 'bold', textShadow: 'none', boxShadow: '0 0 10px rgba(255,204,0,0.8)' }}>ENTIDADE SUPREMA</span>}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, position: 'relative', zIndex: 1 }}>
                <div style={{ gridColumn: 'span 2', background: 'rgba(0,0,0,0.6)', padding: '10px', borderRadius: '5px', border: '1px solid #444', display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <label style={{ color: '#aaa', fontSize: '0.9em', fontWeight: 'bold', margin: 0 }}>⏳ Linha Temporal (Mesa):</label>
                    <select className="input-neon" value={mesa} onChange={e => { setMesa(e.target.value); comitarBio({ mesa: e.target.value }); }} style={{ flex: 1, padding: '8px', borderColor: '#444' }}>
                        <option value="presente">⚔️ Lendas do Presente</option>
                        <option value="futuro">🚀 Lendas do Futuro</option>
                        <option value="npc">👹 NPC / Inimigo / Invocações</option>
                    </select>
                </div>
                {isGrand && (
                    <div className="fade-in" style={{ gridColumn: 'span 2', textAlign: 'center', borderBottom: '1px solid rgba(255,204,0,0.3)', paddingBottom: '25px', marginBottom: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 2 }}>
                        <div style={{ width: '140px', height: '140px', borderRadius: '50%', border: '3px solid #ffcc00', boxShadow: '0 0 30px rgba(255,0,60,0.8), inset 0 0 20px rgba(255,204,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', overflow: 'hidden', marginBottom: '15px', fontSize: '4em', textShadow: '0 0 20px #ffcc00' }}>
                            {grandIcone ? <img src={grandIcone} alt="Avatar Grand" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👑'}
                        </div>
                        <h2 style={{ color: '#ffcc00', margin: '0', letterSpacing: '5px', textShadow: '0 0 20px #ff003c, 0 0 10px #ffcc00', textTransform: 'uppercase', fontSize: '2.2em' }}>GRAND {classe}</h2>
                        <p style={{ color: '#ffcc00', fontSize: '1em', fontWeight: 'bold', margin: '10px 0 0 0', textShadow: '0 0 5px #ff003c', letterSpacing: '2px' }}>O RECEPTÁCULO ABSOLUTO DO TRONO DA ASCENSÃO</p>
                    </div>
                )}
                <div><label style={{ color: '#aaa', fontSize: '0.85em' }}>Raça</label><input className="input-neon" type="text" value={raca} onChange={e => setRaca(e.target.value)} /></div>
                {!isGrand && (
                    <div>
                        <label style={{ color: '#00ffcc', fontSize: '0.85em', fontWeight: 'bold' }}>Classe Mística</label>
                        <select className="input-neon" value={classe} onChange={e => { const val = e.target.value; setClasse(val); if (val !== 'alterego' && val !== 'pretender') { setSubClasse(''); comitarBio({ classe: val, subClasse: '' }); } else { comitarBio({ classe: val }); } }} style={{ width: '100%', padding: '6px', background: '#111', color: '#00ffcc', border: '1px solid #00ffcc', borderRadius: '4px' }}>
                            {CLASSES_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                    </div>
                )}
                {(!isGrand && classe === 'alterego') && (
                    <div className="fade-in" style={{ gridColumn: 'span 2', background: 'rgba(255, 0, 255, 0.1)', padding: '15px', borderRadius: '5px', border: '1px dashed #ff00ff' }}>
                        <label style={{ color: '#ff00ff', fontSize: '0.9em', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>🎭 Dualidade (Fragmento Base + Entidade)</label>
                        <p style={{ color: '#aaa', fontSize: '0.75em', margin: '2px 0 12px 0', lineHeight: '1.4' }}>O Alter Ego possui 2 fragmentos: a sua Classe Base e a Classe concedida por um Ser Selado. <strong>Você só pode ativar os poderes de uma delas por vez.</strong></p>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
                            <div>
                                <label style={{ color: '#ff00ff', fontSize: '0.75em' }}>Fragmento Fixo (Slot 1)</label>
                                <select className="input-neon" value={alterEgoSlot1} onChange={e => { const val = e.target.value; setAlterEgoSlot1(val); if(subClasse === alterEgoSlot1 && alterEgoSlot1 !== '') { setSubClasse(val); comitarBio({ alterEgoSlot1: val, subClasse: val }); } else { comitarBio({ alterEgoSlot1: val }); } }} style={{ width: '100%', padding: '6px', background: '#111', color: '#ff00ff', border: '1px solid #ff00ff', borderRadius: '4px' }}>
                                    {CLASSES_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ color: '#00ffcc', fontSize: '0.75em' }}>Fragmento da Entidade (Slot 2)</label>
                                <select className="input-neon" value={alterEgoSerId} onChange={e => { const val = e.target.value; setAlterEgoSerId(val); const serC = seresComClasse.find(s=>s.id===val)?.classe || ''; if(subClasse && subClasse !== alterEgoSlot1) { setSubClasse(serC); comitarBio({ alterEgoSerId: val, subClasse: serC }); } else { comitarBio({ alterEgoSerId: val }); } }} style={{ width: '100%', padding: '6px', background: '#111', color: '#00ffcc', border: '1px solid #00ffcc', borderRadius: '4px' }}>
                                    <option value="">Nenhuma Entidade Selecionada</option>
                                    {seresComClasse.map(s => <option key={s.id} value={s.id}>🐺 {s.nome} ({CLASSES_OPTIONS.find(o=>o.value===s.classe)?.label || s.classe})</option>)}
                                </select>
                            </div>
                        </div>

                        <label style={{ color: '#ffcc00', fontSize: '0.8em', display: 'block', marginBottom: '8px' }}>⚡ Qual Fragmento está a dominar o seu corpo neste turno?</label>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <button className={`btn-neon ${subClasse === alterEgoSlot1 && alterEgoSlot1 !== '' ? 'btn-gold' : ''}`} onClick={(e) => { e.preventDefault(); mudarSubClasseDireto(alterEgoSlot1); }} disabled={!alterEgoSlot1} style={{ flex: '1 1 100px', padding: '6px', fontSize: '0.75em', margin: 0, opacity: !alterEgoSlot1 ? 0.3 : 1 }}>{alterEgoSlot1 ? `Ativar ${CLASSES_OPTIONS.find(o => o.value === alterEgoSlot1)?.label}` : 'Slot 1 Vazio'}</button>
                            
                            <button className={`btn-neon ${alterEgoSerId && subClasse === seresComClasse.find(s=>s.id===alterEgoSerId)?.classe ? 'btn-gold' : ''}`} onClick={(e) => { e.preventDefault(); const s = seresComClasse.find(x=>x.id===alterEgoSerId); if(s) mudarSubClasseDireto(s.classe); }} disabled={!alterEgoSerId} style={{ flex: '1 1 100px', padding: '6px', fontSize: '0.75em', margin: 0, borderColor: '#00ffcc', color: '#00ffcc', opacity: !alterEgoSerId ? 0.3 : 1 }}>
                                {alterEgoSerId ? `Ativar ${CLASSES_OPTIONS.find(o=>o.value===seresComClasse.find(s=>s.id===alterEgoSerId)?.classe)?.label || 'Entidade'}` : 'Slot 2 Vazio'}
                            </button>

                            <button className={`btn-neon ${subClasse === '' ? 'btn-red' : ''}`} onClick={(e) => { e.preventDefault(); mudarSubClasseDireto(''); }} style={{ flex: '1 1 100px', padding: '6px', fontSize: '0.75em', margin: 0 }}>Desativar Todos</button>
                        </div>
                    </div>
                )}
                {(!isGrand && classe === 'pretender') && (
                    <div className="fade-in" style={{ gridColumn: 'span 2', background: 'rgba(255, 170, 0, 0.1)', padding: '12px', borderRadius: '5px', border: '1px dashed #ffaa00' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <label style={{ color: '#ffaa00', fontSize: '0.9em', fontWeight: 'bold' }}>🤥 O Disfarce Perfeito (Memória)</label>
                            <button className="btn-neon btn-red btn-small" onClick={descansoLongoPretender} style={{ margin: 0, padding: '4px 10px', fontSize: '0.7em' }}>🏕️ DESCANSO LONGO</button>
                        </div>
                        <p style={{ color: '#ccc', fontSize: '0.75em', margin: '0 0 10px 0', lineHeight: '1.4' }}>Para assumir uma classe, o Pretender precisa <strong>ver o inimigo em ação</strong>. Marque as classes que você copiou nesta sessão. Após um Descanso Longo, as suas memórias são apagadas.</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '15px' }}>
                            {CLASSES_OPTIONS.filter(o => o.value !== '' && o.value !== 'pretender').map(opt => {
                                const isMemorizado = classesMemorizadas.includes(opt.value);
                                return (
                                    <label key={opt.value} style={{ fontSize: '0.75em', color: isMemorizado ? '#000' : '#ffaa00', background: isMemorizado ? '#ffaa00' : 'transparent', border: `1px solid #ffaa00`, padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s', textShadow: isMemorizado ? 'none' : '0 0 5px rgba(255,170,0,0.5)' }}>
                                        <input type="checkbox" style={{ display: 'none' }} checked={isMemorizado} onChange={() => toggleMemoriaPretender(opt.value)} />{isMemorizado ? `✓ ${opt.label}` : opt.label}
                                    </label>
                                );
                            })}
                        </div>
                        <label style={{ color: '#ffaa00', fontSize: '0.8em', display: 'block', marginBottom: '4px' }}>Disfarce Atual (Aplica os buffs imediatamente):</label>
                        <select className="input-neon" value={subClasse} onChange={e => mudarSubClasseDireto(e.target.value)} style={{ width: '100%', padding: '6px', background: '#111', color: '#ffaa00', border: '1px solid #ffaa00', borderRadius: '4px' }}>
                            <option value="">Nenhum Disfarce</option>
                            {CLASSES_OPTIONS.filter(o => classesMemorizadas.includes(o.value)).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                    </div>
                )}
                <div><label style={{ color: '#aaa', fontSize: '0.85em' }}>Idade</label><input className="input-neon" type="text" value={idade} onChange={e => setIdade(e.target.value)} /></div>
                <div><label style={{ color: '#aaa', fontSize: '0.85em' }}>Físico</label><input className="input-neon" type="text" value={fisico} onChange={e => setFisico(e.target.value)} /></div>
                <div><label style={{ color: '#aaa', fontSize: '0.85em' }}>Tipo Sanguíneo</label><input className="input-neon" type="text" value={sangue} onChange={e => setSangue(e.target.value)} /></div>
                <div><label style={{ color: '#aaa', fontSize: '0.85em' }}>Alinhamento</label><input className="input-neon" type="text" value={alinhamento} onChange={e => setAlinhamento(e.target.value)} /></div>
                <div><label style={{ color: '#aaa', fontSize: '0.85em' }}>Afiliação</label><input className="input-neon" type="text" value={afiliacao} onChange={e => setAfiliacao(e.target.value)} /></div>
                <div><label style={{ color: '#aaa', fontSize: '0.85em' }}>Dinheiro</label><input className="input-neon" type="text" value={dinheiro} onChange={e => setDinheiro(e.target.value)} /></div>
            </div>
            <button className="btn-neon btn-gold" onClick={salvarBio} style={{ marginTop: 15, width: '100%', position: 'relative', zIndex: 1, backgroundColor: salvandoBio ? 'rgba(0, 255, 100, 0.2)' : undefined, borderColor: salvandoBio ? '#00ffcc' : undefined, color: salvandoBio ? '#fff' : undefined }}>{salvandoBio ? 'SALVO COM SUCESSO!' : 'SALVAR BIO'}</button>
        </div>
    );
}

// 🔥 NOVO COMPONENTE: GESTOR DE ESTADOS NEGATIVOS E RESISTÊNCIAS (AGORA LÊ DO COMPÊNDIO!) 🔥
export function FichaCondicoesEElementais() {
    const ctx = useFichaForm();
    if (!ctx) return null;

    const { minhaFicha, modificarCondicao, toggleAfinidade, condicoesDinamicas, elementosDinamicos } = ctx;

    const afinidades = minhaFicha.afinidades || { resistencias: [], vulnerabilidades: [], imunidades: [], absorcoes: [] };
    const condicoesAtivas = minhaFicha.condicoes || [];

    return (
        <div className="def-box fade-in" style={{ marginTop: 15, borderLeft: '4px solid #ff4444' }}>
            <h3 style={{ color: '#ff4444', margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🩸 ESTADOS & AFINIDADES ELEMENTAIS
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                
                {/* COLUNA 1: CONDIÇÕES DINÂMICAS */}
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid #333' }}>
                    <strong style={{ color: '#aaa', fontSize: '0.75em', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>Debuffs Ativos (Stacks)</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {condicoesDinamicas.map(c => {
                            const ativa = condicoesAtivas.find(ca => ca.id === c.id);
                            const corDefault = c.cor || '#ff4444';
                            return (
                                <div key={c.id} title={c.nome} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: ativa ? `${corDefault}15` : 'rgba(255,255,255,0.02)', border: `1px solid ${ativa ? corDefault : '#444'}`, padding: '5px', borderRadius: '6px', minWidth: '60px' }}>
                                    <span style={{ fontSize: '1.2em' }}>{c.icone}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
                                        <button onClick={() => modificarCondicao(c.id, -1)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '0 5px' }}>-</button>
                                        <strong style={{ color: ativa ? corDefault : '#666', fontSize: '0.9em' }}>{ativa ? ativa.stacks : 0}</strong>
                                        <button onClick={() => modificarCondicao(c.id, 1)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '0 5px' }}>+</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* COLUNA 2: RESISTÊNCIAS DINÂMICAS */}
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid #333' }}>
                    <strong style={{ color: '#aaa', fontSize: '0.75em', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>Afinidades (Clique p/ Alternar)</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {elementosDinamicos.map(e => {
                            const isRes = afinidades.resistencias?.includes(e.id);
                            const isVul = afinidades.vulnerabilidades?.includes(e.id);
                            const isImu = afinidades.imunidades?.includes(e.id);
                            
                            let bColor = '#444'; let shadow = 'none';
                            if (isRes) bColor = '#00ffcc';
                            if (isVul) bColor = '#ffaa00';
                            if (isImu) { bColor = '#ffffff'; shadow = '0 0 10px #fff'; }

                            return (
                                <button 
                                    key={e.id}
                                    onClick={() => {
                                        if (!isRes && !isVul && !isImu) toggleAfinidade('resistencias', e.id);
                                        else if (isRes) toggleAfinidade('vulnerabilidades', e.id);
                                        else if (isVul) toggleAfinidade('imunidades', e.id);
                                        else toggleAfinidade('imunidades', e.id); 
                                    }}
                                    title={`${e.nome.toUpperCase()}: Neutro -> Resistente -> Vulnerável -> Imune`}
                                    style={{ 
                                        width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                        background: 'rgba(0,0,0,0.5)', border: `2px solid ${bColor}`, borderRadius: '4px',
                                        cursor: 'pointer', fontSize: '1.2em', boxShadow: shadow
                                    }}
                                >
                                    {e.icone}
                                </button>
                            );
                        })}
                    </div>
                    <div style={{ marginTop: '10px', fontSize: '0.7em', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <span style={{ color: '#00ffcc' }}>● Resistente</span>
                        <span style={{ color: '#ffaa00' }}>● Vulnerável</span>
                        <span style={{ color: '#ffffff' }}>● Imune</span>
                    </div>
                </div>

            </div>
        </div>
    );
}

export function FichaSeresSelados() {
    const ctx = useFichaForm();
    if (!ctx) return null;
    const {
        seresSelados, serNome, setSerNome, serDescricao, setSerDescricao,
        serElemento, setSerElemento, serClasse, setSerClasse, serEditandoId, serZeraCusto, setSerZeraCusto,
        serEfeitos, serEfeitosPassivos, 
        serNovoNomeEfeito, setSerNovoNomeEfeito, 
        serNovoAtr, setSerNovoAtr, serNovoProp, setSerNovoProp, serNovoVal, setSerNovoVal,
        serNovoNomeEfeitoPassivo, setSerNovoNomeEfeitoPassivo, 
        serNovoAtrPassivo, setSerNovoAtrPassivo, serNovoPropPassivo, setSerNovoPropPassivo, serNovoValPassivo, setSerNovoValPassivo,
        addSerEfeito, removeSerEfeito, addSerEfeitoPassivo, removeSerEfeitoPassivo,
        addSerSelado, editarSerSelado, removeSerSelado, toggleSerSelado, cancelarEdicaoSer,
        salvarFormaSer, deletarFormaSer, ativarFormaSer
    } = ctx;

    return (
        <div className="def-box fade-in" style={{ marginTop: 15, background: 'rgba(138, 43, 226, 0.05)', border: '1px solid #8a2be2', boxShadow: '0 0 15px rgba(138, 43, 226, 0.2)' }}>
            <h3 style={{ color: '#8a2be2', margin: '0 0 10px 0', textShadow: '0 0 5px #8a2be2' }}>👁️ Reino Interior (Entidades Seladas & Pactos)</h3>
            <p style={{ color: '#aaa', fontSize: '0.85em', margin: '0 0 15px 0' }}>Gerencie as entidades, espíritos ou demônios que habitam sua alma. Sincronize com a entidade para acessar as suas Formas passivas e ativas.</p>

            {seresSelados.length > 0 && (
                <div style={{ display: 'grid', gap: '10px', marginBottom: '20px' }}>
                    {seresSelados.map(ser => (
                        <div key={ser.id} style={{ background: 'rgba(0,0,0,0.6)', borderLeft: `4px solid ${ser.ativo ? '#00ffcc' : '#555'}`, padding: '15px', borderRadius: '5px', transition: '0.3s' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ margin: 0, color: ser.ativo ? '#00ffcc' : '#fff', textShadow: ser.ativo ? '0 0 10px #00ffcc' : 'none', fontSize: '1.2em' }}>{ser.nome}</h4>
                                    <div style={{ color: '#8a2be2', fontSize: '0.8em', fontWeight: 'bold', marginTop: '4px' }}>Domínio: {ser.elemento || 'Nenhum'} {ser.zeraCusto && <span style={{ color: '#00ffcc' }}>(Zera Custo)</span>}</div>
                                    {ser.classe && <div style={{ color: '#00ffcc', fontSize: '0.8em', fontWeight: 'bold', marginTop: '2px' }}>Classe Herdada: {CLASSES_OPTIONS.find(o => o.value === ser.classe)?.label || ser.classe}</div>}
                                </div>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    <button className={`btn-neon btn-small ${ser.ativo ? 'btn-green' : ''}`} onClick={() => toggleSerSelado(ser.id)} style={{ margin: 0, boxShadow: ser.ativo ? '0 0 10px #0f0' : 'none' }}>{ser.ativo ? '🌀 SINCRONIZADO' : 'ADORMECIDO'}</button>
                                    <button className="btn-neon btn-blue btn-small" onClick={() => editarSerSelado(ser.id)} style={{ margin: 0 }}>⚙️</button>
                                    <button className="btn-neon btn-red btn-small" onClick={() => removeSerSelado(ser.id)} style={{ margin: 0 }}>X</button>
                                </div>
                            </div>
                            <p style={{ color: '#ccc', fontSize: '0.85em', marginTop: '10px', fontStyle: 'italic', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>{ser.descricao}</p>
                            
                            {((ser.efeitos && ser.efeitos.length > 0) || (ser.efeitosPassivos && ser.efeitosPassivos.length > 0)) && (
                                <div style={{ marginTop: '10px', borderTop: '1px dashed #555', paddingTop: '8px' }}>
                                    {ser.efeitos?.map((e, idx) => <span key={`a-${idx}`} style={{ display: 'inline-block', fontSize: '0.7em', color: '#0ff', background: 'rgba(0,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', marginRight: '4px', marginBottom: '4px' }}>{e.nome}: +{e.valor}</span>)}
                                    {ser.efeitosPassivos?.map((e, idx) => <span key={`p-${idx}`} style={{ display: 'inline-block', fontSize: '0.7em', color: '#f0f', background: 'rgba(255,0,255,0.1)', padding: '2px 6px', borderRadius: '4px', marginRight: '4px', marginBottom: '4px' }}>[Pass] {e.nome}: +{e.valor}</span>)}
                                </div>
                            )}

                            <div style={{ marginTop: '15px', paddingTop: '10px', borderTop: '1px solid #444' }}>
                                <h5 style={{ color: '#0ff', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: '1px' }}>🎭 Formas / Modos de Sincronização</h5>
                                <FormasEditor
                                    formas={ser.formas || []}
                                    formaAtivaId={ser.formaAtivaId || null}
                                    onSalvarForma={(forma) => salvarFormaSer(ser.id, forma)}
                                    onDeletarForma={(formaId) => deletarFormaSer(ser.id, formaId)}
                                    onAtivarForma={(formaId) => ativarFormaSer(ser.id, formaId)}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '15px', borderRadius: '5px', border: '1px dashed #8a2be2' }}>
                <h4 style={{ color: '#8a2be2', margin: '0 0 10px 0' }}>{serEditandoId ? '⚙️ Editar Entidade' : '🔗 Vincular Nova Entidade'}</h4>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    <input className="input-neon" type="text" placeholder="Nome da Entidade (Ex: Kurama, Sukuna)" value={serNome} onChange={e => setSerNome(e.target.value)} style={{ flex: '2 1 200px', margin: 0, borderColor: '#8a2be2', color: '#fff' }} />
                    <input className="input-neon" type="text" placeholder="Elemento / Essência" value={serElemento} onChange={e => setSerElemento(e.target.value)} style={{ flex: '1 1 120px', margin: 0, borderColor: '#8a2be2', color: '#fff' }} />
                    <select className="input-neon" value={serClasse} onChange={e => setSerClasse(e.target.value)} style={{ flex: '1 1 120px', margin: 0, borderColor: '#8a2be2', color: '#fff' }}>
                        <option value="">Classe (Opcional)</option>
                        {CLASSES_OPTIONS.filter(o => o.value !== '').map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#00ffcc', fontSize: '0.85em', cursor: 'pointer', flex: '1 1 100%' }}>
                        <input type="checkbox" checked={serZeraCusto} onChange={e => setSerZeraCusto(e.target.checked)} style={{ transform: 'scale(1.2)' }} />
                        Zera custo do Elemento Base passivamente?
                    </label>
                </div>
                <textarea className="input-neon" placeholder="História, condições do pacto, e narrativas do que acontece quando o poder dele transborda..." value={serDescricao} onChange={e => setSerDescricao(e.target.value)} style={{ width: '100%', minHeight: '60px', borderColor: '#8a2be2', color: '#ccc', resize: 'vertical', marginBottom: '15px' }} />
                
                <h5 style={{ color: '#0ff', margin: '0 0 5px 0', fontSize: '0.85em' }}>💥 Buffs Ativos (Injetados ao Sincronizar)</h5>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 5, marginBottom: '10px' }}>
                    <input className="input-neon" type="text" placeholder="Nome do Efeito" value={serNovoNomeEfeito} onChange={e => setSerNovoNomeEfeito(e.target.value)} />
                    <select className="input-neon" value={serNovoAtr} onChange={e => setSerNovoAtr(e.target.value)}>{ATRIBUTO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                    <select className="input-neon" value={serNovoProp} onChange={e => setSerNovoProp(e.target.value)}>{PROPRIEDADE_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.lbl}</option>)}</select>
                    <div style={{ display: 'flex', gap: 5 }}><input className="input-neon" type="text" placeholder="Valor" value={serNovoVal} onChange={e => setSerNovoVal(e.target.value)} style={{ width: '60px' }} /><button className="btn-neon btn-blue" onClick={addSerEfeito} style={{ padding: '0 10px', margin: 0 }}>+</button></div>
                </div>
                <div style={{ marginBottom: '15px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {serEfeitos.map((e, i) => (
                        <div key={i} style={{ fontSize: '0.75em', color: '#0ff', background: 'rgba(0,255,255,0.1)', padding: '4px 8px', borderRadius: '4px', border: '1px solid #0ff', display: 'flex', gap: '5px', alignItems: 'center' }}>
                            <span>{e.nome}: [{e.atributo}] {e.propriedade}: +{e.valor}</span>
                            <button onClick={() => removeSerEfeito(i)} style={{ background: 'none', border: 'none', color: '#f00', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
                        </div>
                    ))}
                </div>

                <h5 style={{ color: '#f0f', margin: '0 0 5px 0', fontSize: '0.85em' }}>🛡️ Buffs Passivos (Passados passivamente para o Hospedeiro)</h5>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 5, marginBottom: '10px' }}>
                    <input className="input-neon" type="text" placeholder="Nome do Passivo" value={serNovoNomeEfeitoPassivo} onChange={e => setSerNovoNomeEfeitoPassivo(e.target.value)} />
                    <select className="input-neon" value={serNovoAtrPassivo} onChange={e => setSerNovoAtrPassivo(e.target.value)}>{ATRIBUTO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                    <select className="input-neon" value={serNovoPropPassivo} onChange={e => setSerNovoPropPassivo(e.target.value)}>{PROPRIEDADE_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.lbl}</option>)}</select>
                    <div style={{ display: 'flex', gap: 5 }}><input className="input-neon" type="text" placeholder="Valor" value={serNovoValPassivo} onChange={e => setSerNovoValPassivo(e.target.value)} style={{ width: '60px' }} /><button className="btn-neon" onClick={addSerEfeitoPassivo} style={{ padding: '0 10px', margin: 0, borderColor: '#f0f', color: '#f0f' }}>+</button></div>
                </div>
                <div style={{ marginBottom: '15px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {serEfeitosPassivos.map((e, i) => (
                        <div key={i} style={{ fontSize: '0.75em', color: '#f0f', background: 'rgba(255,0,255,0.1)', padding: '4px 8px', borderRadius: '4px', border: '1px solid #f0f', display: 'flex', gap: '5px', alignItems: 'center' }}>
                            <span>{e.nome}: [{e.atributo}] {e.propriedade}: +{e.valor}</span>
                            <button onClick={() => removeSerEfeitoPassivo(i)} style={{ background: 'none', border: 'none', color: '#f00', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-neon" style={{ flex: 1, borderColor: '#8a2be2', color: '#8a2be2', fontWeight: 'bold', margin: 0 }} onClick={addSerSelado}>{serEditandoId ? '💾 SALVAR MUDANÇAS' : '+ FORJAR PACTO'}</button>
                    {serEditandoId && <button className="btn-neon btn-red" style={{ flex: 1, margin: 0 }} onClick={cancelarEdicaoSer}>CANCELAR</button>}
                </div>
            </div>
        </div>
    );
}

export function FichaEditorAtributos() {
    const ctx = useFichaForm();
    if (!ctx) return FALLBACK;
    const { selAtributo, setSelAtributo, campos, handleCampo, salvarAtributo, buffsAtuais } = ctx;

    return (
        <div className="def-box" style={{ marginTop: 15 }}>
            <h3 style={{ color: '#ffcc00', marginBottom: 10 }}>Editor de Atributos</h3>
            <select className="input-neon" value={selAtributo} onChange={(e) => setSelAtributo(e.target.value)} style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.5)', color: '#fff' }}>
                {ATRIBUTO_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 15, marginTop: 15 }}>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Base</label>
                    <input className="input-neon" type="number" value={campos.base} onChange={e => handleCampo('base', e.target.value)} />
                    {buffsAtuais && renderBuffHolograma(campos.base, buffsAtuais.base, false, false)}
                </div>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Mult Base</label>
                    <input className="input-neon" type="number" step="0.01" value={campos.mBase} onChange={e => handleCampo('mBase', e.target.value)} />
                    {buffsAtuais && renderBuffHolograma(campos.mBase, buffsAtuais.mbase, buffsAtuais._hasBuff.mbase, true)}
                </div>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Regeneração</label>
                    <input className="input-neon" type="number" step="0.01" value={campos.regeneracao} onChange={e => handleCampo('regeneracao', e.target.value)} />
                    {buffsAtuais && renderBuffHolograma(campos.regeneracao, buffsAtuais.regeneracao, false, false)}
                </div>
            </div>
            <button className="btn-neon btn-gold" onClick={salvarAtributo} style={{ marginTop: 15, width: '100%', height: '44px' }}>SALVAR ATRIBUTOS</button>
        </div>
    );
}

export function FichaReatorElemental() {
    const ctx = useFichaForm();
    if (!ctx) return FALLBACK;
    const { showElemental, getAtualVital } = ctx;
    if (!showElemental) return null;
    return (
        <div className="def-box fade-in" style={{ marginTop: 15, background: 'rgba(0, 255, 204, 0.05)', border: '1px solid #00ffcc', boxShadow: '0 0 15px rgba(0, 255, 204, 0.2)' }}>
            <h3 style={{ color: '#00ffcc', margin: '0 0 10px 0', textShadow: '0 0 5px #00ffcc' }}>🌪️ Reator de Ressonância (Elemental)</h3>
            <p style={{ color: '#aaa', fontSize: '0.85em', margin: '0 0 10px 0' }}>A força bruta da natureza funde as suas energias. Utilize este reator para verificar a sua <strong>Energia Elemental Atual</strong>.</p>
            <div style={{ background: 'rgba(0,0,0,0.5)', padding: '15px', borderRadius: '5px', borderLeft: '3px solid #00ffcc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div style={{ color: '#fff', fontSize: '1.2em', fontWeight: 'bold' }}>Soma das Energias (Mana + Aura + Chakra)</div>
                    <div style={{ color: '#0cf', fontSize: '0.9em', marginTop: '4px' }}>Bônus Bruto Dano Elemental: <strong style={{ color: '#0f0', fontSize: '1.3em' }}>+{(getAtualVital('mana') + getAtualVital('aura') + getAtualVital('chakra'))}</strong></div>
                </div>
            </div>
        </div>
    );
}

export function FichaDistorcaoConceitual() {
    const ctx = useFichaForm();
    if (!ctx) return FALLBACK;
    const { showConceitual, leisCena, novaLeiNome, setNovaLeiNome, addLeiCena, removeLeiCena } = ctx;
    if (!showConceitual) return null;
    return (
        <div className="def-box fade-in" style={{ marginTop: 15, background: 'rgba(255, 0, 255, 0.05)', border: '1px solid #ff00ff', boxShadow: '0 0 15px rgba(255, 0, 255, 0.2)' }}>
            <h3 style={{ color: '#ff00ff', margin: '0 0 10px 0', textShadow: '0 0 5px #ff00ff' }}>🧩 Distorção Conceitual (Quebra de Regras)</h3>
            <p style={{ color: '#aaa', fontSize: '0.85em', margin: '0 0 15px 0' }}>Anomalias conceituais reescrevem as laws da realidade. Decrete as "Leis da Cena" em vigor.</p>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '15px' }}>
                <input className="input-neon" type="text" placeholder="Decrete uma nova Lei (Ex: Oponentes não podem esquivar)" value={novaLeiNome} onChange={e => setNovaLeiNome(e.target.value)} style={{ flex: '1 1 200px', minHeight: '48px', fontSize: '1.1em', padding: '10px', borderColor: '#ff00ff', color: '#fff', margin: 0 }} />
                <button className="btn-neon" style={{ flex: '0 1 150px', minHeight: '48px', borderColor: '#ff00ff', color: '#ff00ff', margin: 0, padding: '10px 20px', fontSize: '1.1em', fontWeight: 'bold', background: 'rgba(255, 0, 255, 0.1)' }} onClick={addLeiCena}>+ DECRETAR</button>
            </div>
            {leisCena.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {leisCena.map(lei => (
                        <div key={lei.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.5)', padding: '10px 15px', borderRadius: '5px', borderLeft: '3px solid #ff00ff' }}>
                            <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.1em', fontStyle: 'italic' }}>"{lei.texto}"</div>
                            <button className="btn-neon btn-small btn-red" style={{ padding: '5px 15px' }} onClick={() => removeLeiCena(lei.id)}>REVOGAR</button>
                        </div>
                    ))}
                </div>
            ) : ( <div style={{ color: '#555', fontStyle: 'italic', textAlign: 'center' }}>Nenhuma lei conceitual em vigor.</div> )}
        </div>
    );
}

export function FichaMatrizUtilitaria() {
    const ctx = useFichaForm();
    if (!ctx) return FALLBACK;
    const { showUtilitario, copiasAtivas, novaCopiaNome, setNovaCopiaNome, novaCopiaEfeito, setNovaCopiaEfeito, addCopiaAtiva, removeCopiaAtiva } = ctx;
    if (!showUtilitario) return null;
    return (
        <div className="def-box fade-in" style={{ marginTop: 15, background: 'rgba(255, 204, 0, 0.05)', border: '1px solid #ffcc00', boxShadow: '0 0 15px rgba(255, 204, 0, 0.2)' }}>
            <h3 style={{ color: '#ffcc00', margin: '0 0 10px 0', textShadow: '0 0 5px #ffcc00' }}>🛠️ Matriz Utilitária (Mimetismo e Suporte)</h3>
            <p style={{ color: '#aaa', fontSize: '0.85em', margin: '0 0 15px 0' }}>Para Infinities de Cópia (ex: Ketsuda). Registe as habilidades ou buffs copiados temporariamente durante a luta.</p>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '15px' }}>
                <input className="input-neon" type="text" placeholder="Nome do Poder Copiado" value={novaCopiaNome} onChange={e => setNovaCopiaNome(e.target.value)} style={{ flex: '1 1 200px', minHeight: '48px', fontSize: '1.1em', padding: '10px', borderColor: '#ffcc00', color: '#fff', margin: 0 }} />
                <input className="input-neon" type="text" placeholder="Efeito / Buff (Ex: +2000 Dano)" value={novaCopiaEfeito} onChange={e => setNovaCopiaEfeito(e.target.value)} style={{ flex: '1 1 200px', minHeight: '48px', fontSize: '1.1em', padding: '10px', borderColor: '#ffcc00', color: '#fff', margin: 0 }} />
                <button className="btn-neon" style={{ flex: '0 1 200px', minHeight: '48px', borderColor: '#ffcc00', color: '#ffcc00', margin: 0, padding: '10px 20px', fontSize: '1.1em', fontWeight: 'bold', background: 'rgba(255, 204, 0, 0.1)' }} onClick={addCopiaAtiva}>+ ARMAZENAR</button>
            </div>
            {copiasAtivas.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {copiasAtivas.map(copia => (
                        <div key={copia.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px', borderLeft: '3px solid #ffcc00' }}>
                            <div><div style={{ color: '#fff', fontWeight: 'bold' }}>{copia.nome}</div><div style={{ color: '#0f0', fontSize: '0.85em', marginTop: '2px' }}>{copia.efeito}</div></div>
                            <button className="btn-neon btn-small btn-red" style={{ padding: '5px 10px', margin: 0 }} onClick={() => removeCopiaAtiva(copia.id)}>X</button>
                        </div>
                    ))}
                </div>
            ) : ( <div style={{ color: '#555', fontStyle: 'italic', textAlign: 'center' }}>Matriz vazia. Nenhuma cópia ativa.</div> )}
        </div>
    );
}

export function FichaFuriaBerserker() {
    const ctx = useFichaForm();
    if (!ctx) return FALLBACK;
    const { multiplicadorFuriaClasse, furiaAcalmadaMsg, acalmarFuria, percAtualLostFloor, percEfetivoParaDisplay, multiplicadorFuriaVisor } = ctx;
    if (!(multiplicadorFuriaClasse > 0)) return null;
    return (
        <div className="def-box fade-in" style={{ marginTop: 15, background: 'rgba(255, 0, 0, 0.1)', border: '1px solid rgba(255,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ color: '#ff0000', margin: 0, textShadow: '0 0 5px #ff0000' }}>🩸 Fúria Berserker (Mad Enhancement)</h3>
                <button className="btn-neon btn-small" onClick={acalmarFuria} style={{ margin: 0, borderColor: furiaAcalmadaMsg ? '#0f0' : '#fff', color: furiaAcalmadaMsg ? '#0f0' : '#fff' }}>{furiaAcalmadaMsg ? '✨ FÚRIA RESETADA!' : 'Acalmar Fúria'}</button>
            </div>
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px' }}>
                    <span style={{ color: '#aaa', fontSize: '0.8em', display: 'block' }}>Vida Perdida Atual:</span>
                    <span style={{ color: '#ffcc00', fontSize: '1.2em', fontWeight: 'bold' }}>{percAtualLostFloor}%</span>
                </div>
                <div style={{ background: 'rgba(255,0,0,0.2)', padding: '10px', borderRadius: '5px', borderLeft: '3px solid #ff0000' }}>
                    <span style={{ color: '#aaa', fontSize: '0.8em', display: 'block' }}>Máximo Atingido (Mantido após Cura):</span>
                    <span style={{ color: '#ff0000', fontSize: '1.2em', fontWeight: 'bold' }}>{percEfetivoParaDisplay}%</span>
                </div>
            </div>
            <p style={{ color: '#0f0', fontSize: '0.9em', marginTop: 10, marginBottom: 0 }}>↳ Bônus no Multiplicador Geral: <strong style={{ color: '#fff' }}>+{multiplicadorFuriaVisor}x</strong></p>
            <p style={{ color: '#aaa', fontSize: '0.75em', marginTop: 5, marginBottom: 0 }}><i className="fas fa-info-circle"></i> Com 1% de HP perdido ganha o bônus inicial (+{multiplicadorFuriaClasse}x). A partir de 2%, ganha +1x por cada 1% de HP perdido.</p>
        </div>
    );
}

export function FichaMarcadoresCena() {
    const ctx = useFichaForm();
    if (!ctx) return FALLBACK;
    const { showMarcadoresCena, resetarTrackersCena, novoTrackerNome, setNovoTrackerNome, novoTrackerValor, setNovoTrackerValor, addTrackerCena, trackersCena, modTrackerCena, removeTrackerCena } = ctx;
    if (!showMarcadoresCena) return null;
    return (
        <div className="def-box fade-in" style={{ marginTop: 15, background: 'rgba(255, 136, 0, 0.05)', border: '1px solid #ff8800', boxShadow: '0 0 15px rgba(255, 136, 0, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ color: '#ff8800', margin: 0, textShadow: '0 0 5px #ff8800' }}>⚔️ Marcadores de Cena (Escalonamento)</h3>
                <button className="btn-neon btn-small btn-red" onClick={resetarTrackersCena} style={{ margin: 0 }}>🧹 RESETAR CENA</button>
            </div>
            <p style={{ color: '#aaa', fontSize: '0.85em', margin: '0 0 15px 0' }}>Para habilidades que acumulam durante a batalha (ex: +8 de Acerto por turno). Adicione os stacks em tempo real. O valor final é apenas visual para você somar no seu teste de dados.</p>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '15px' }}>
                <input className="input-neon" type="text" placeholder="Nome (Ex: Acerto, CA...)" value={novoTrackerNome} onChange={e => setNovoTrackerNome(e.target.value)} style={{ flex: '2 1 200px', minHeight: '48px', fontSize: '1.1em', padding: '10px', borderColor: '#ff8800', color: '#fff', margin: 0 }} />
                <input className="input-neon" type="number" step="0.1" placeholder="Bônus por Stack (Ex: 8)" value={novoTrackerValor} onChange={e => setNovoTrackerValor(e.target.value)} style={{ flex: '1 1 120px', minHeight: '48px', fontSize: '1.1em', padding: '10px', borderColor: '#ff8800', color: '#fff', margin: 0 }} />
                <button className="btn-neon" style={{ flex: '1 1 150px', minHeight: '48px', borderColor: '#ff8800', color: '#ff8800', margin: 0, padding: '10px', fontSize: '1.1em', fontWeight: 'bold', background: 'rgba(255, 136, 0, 0.1)' }} onClick={addTrackerCena}>+ ADICIONAR</button>
            </div>
            {trackersCena.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {trackersCena.map(tracker => {
                        const totalCalculado = tracker.stacks * tracker.valor;
                        return (
                            <div key={tracker.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px', borderLeft: '3px solid #ff8800' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ color: '#fff', fontWeight: 'bold' }}>{tracker.nome} <span style={{ color: '#aaa', fontSize: '0.8em', fontWeight: 'normal' }}>(+{tracker.valor} por stack)</span></div>
                                    <div style={{ color: '#ffcc00', fontSize: '1.1em', marginTop: '4px' }}>Bônus Total na Cena: <strong style={{ color: '#0f0' }}>+{totalCalculado}</strong></div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <button className="btn-neon btn-small btn-red" onClick={() => modTrackerCena(tracker.id, -1)} style={{ padding: '5px 15px', fontSize: '1.2em' }}>-</button>
                                    <span style={{ color: '#fff', fontSize: '1.2em', fontWeight: 'bold', minWidth: '30px', textAlign: 'center' }}>{tracker.stacks}</span>
                                    <button className="btn-neon btn-small" style={{ borderColor: '#0f0', color: '#0f0', padding: '5px 15px', fontSize: '1.2em' }} onClick={() => modTrackerCena(tracker.id, 1)}>+</button>
                                    <button className="btn-neon btn-small" style={{ borderColor: '#555', color: '#888', marginLeft: '10px' }} onClick={() => removeTrackerCena(tracker.id)}>X</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : ( <div style={{ color: '#555', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>Nenhum marcador ativo nesta cena.</div> )}
        </div>
    );
}

export function FichaForjaCalamidade() {
    const ctx = useFichaForm();
    if (!ctx) return FALLBACK;
    const { showForjaCalamidade, alvosInjecao, toggleAlvo, valorInjecao, setValorInjecao, injetarAnomalia, showAbsorverMsg } = ctx;
    if (!showForjaCalamidade) return null;
    return (
        <div className="def-box fade-in" style={{ marginTop: 15, background: 'rgba(0, 204, 255, 0.05)', border: '1px solid #00ccff', boxShadow: '0 0 15px rgba(0, 204, 255, 0.2)' }}>
            <h3 style={{ color: '#00ccff', marginBottom: 10, textShadow: '0 0 5px #00ccff' }}>🌌 Forja de Calamidade Universal (Pós-Luta)</h3>
            <p style={{ color: '#aaa', fontSize: '0.85em', margin: '0 0 15px 0' }}>Como cada Infinity ou Singularidade tem regras únicas, use este painel para injetar os ganhos após o combate. <strong>Calcule o valor final da sua habilidade e escolha onde ele será injetado.</strong></p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px', background: 'rgba(0,0,0,0.5)', padding: '15px', borderRadius: '5px', border: '1px dashed #00ccff' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><input type="checkbox" checked={alvosInjecao.vida} onChange={() => toggleAlvo('vida')} style={{ transform: 'scale(1.2)' }} /><span style={{ color: alvosInjecao.vida ? '#0f0' : '#888', fontWeight: alvosInjecao.vida ? 'bold' : 'normal' }}>Vida Máxima Base</span></label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><input type="checkbox" checked={alvosInjecao.energias} onChange={() => toggleAlvo('energias')} style={{ transform: 'scale(1.2)' }} /><span style={{ color: alvosInjecao.energias ? '#0f0' : '#888', fontWeight: alvosInjecao.energias ? 'bold' : 'normal' }}>Energias Base (Mana/Aura/Chak/Corp)</span></label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><input type="checkbox" checked={alvosInjecao.status} onChange={() => toggleAlvo('status')} style={{ transform: 'scale(1.2)' }} /><span style={{ color: alvosInjecao.status ? '#0f0' : '#888', fontWeight: alvosInjecao.status ? 'bold' : 'normal' }}>Status Base (Força, Destreza, etc.)</span></label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><input type="checkbox" checked={alvosInjecao.danoBruto} onChange={() => toggleAlvo('danoBruto')} style={{ transform: 'scale(1.2)' }} /><span style={{ color: alvosInjecao.danoBruto ? '#0f0' : '#888', fontWeight: alvosInjecao.danoBruto ? 'bold' : 'normal' }}>Dano Bruto Flat (+)</span></label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><input type="checkbox" checked={alvosInjecao.multGeral} onChange={() => toggleAlvo('multGeral')} style={{ transform: 'scale(1.2)' }} /><span style={{ color: alvosInjecao.multGeral ? '#0f0' : '#888', fontWeight: alvosInjecao.multGeral ? 'bold' : 'normal' }}>Multiplicador Geral de Dano (x)</span></label>
            </div>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input className="input-neon" type="number" step="0.01" placeholder="Valor Final (Ex: 25000)" value={valorInjecao} onChange={e => setValorInjecao(e.target.value)} style={{ flex: '1 1 200px', minHeight: '48px', fontSize: '1.2em', padding: '10px', borderColor: '#00ccff', color: '#fff' }} />
                <button className="btn-neon" style={{ flex: '2 1 300px', minHeight: '48px', borderColor: '#00ccff', color: '#00ccff', padding: '10px 20px', fontSize: '1.1em', margin: 0, background: 'rgba(0, 204, 255, 0.1)', fontWeight: 'bold' }} onClick={injetarAnomalia}>⚡ INJETAR EVOLUÇÃO</button>
            </div>
            {showAbsorverMsg && <div style={{ marginTop: '10px', color: '#0f0', fontWeight: 'bold', textShadow: '0 0 5px #0f0', textAlign: 'center' }}>{showAbsorverMsg}</div>}
        </div>
    );
}

export function FichaMultiplicadoresDano() {
    const ctx = useFichaForm();
    if (!ctx) return FALLBACK;
    const { buffsDano, dmBase, setDmBase, dmPotencial, setDmPotencial, dmGeral, setDmGeral, dmFormas, setDmFormas, dmAbsoluto, setDmAbsoluto, dmUnico, setDmUnico, danoBruto, setDanoBruto, salvarMultiplicadores, salvandoMult } = ctx;

    return (
        <div className="def-box" style={{ marginTop: 15 }}>
            <h3 style={{ color: '#ff003c', marginBottom: 10 }}>Multiplicadores de Dano</h3>
            <p style={{ color: '#888', fontSize: '0.8em', margin: '0 0 10px' }}>Valores base. Habilidades ativas somam automaticamente.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Mult Base {buffsDano._hasBuff.mbase && <span style={{ color: '#0f0', fontSize: '0.8em' }}>(Buff: +{buffsDano.mbase.toFixed(2)})</span>}</label>
                    <input className="input-neon" type="number" step="0.01" value={dmBase} onChange={e => setDmBase(e.target.value)} />
                </div>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Mult Potencial</label>
                    <input className="input-neon" type="number" step="0.01" value={dmPotencial} onChange={e => setDmPotencial(e.target.value)} />
                </div>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Mult Geral {buffsDano._hasBuff.mgeral && <span style={{ color: '#0f0', fontSize: '0.8em' }}>(Buff: +{buffsDano.mgeral.toFixed(2)})</span>}</label>
                    <input className="input-neon" type="number" step="0.01" value={dmGeral} onChange={e => setDmGeral(e.target.value)} />
                    {buffsDano.fontesMgeral && buffsDano.fontesMgeral.length > 0 && (
                        <div style={{ marginTop: '5px', padding: '5px', background: 'rgba(0,255,0,0.1)', borderRadius: '4px', borderLeft: '2px solid #0f0' }}>
                            <span style={{ color: '#aaa', fontSize: '0.7em', fontWeight: 'bold', display: 'block', marginBottom: '2px' }}>🔍 Origem dos Buffs:</span>
                            {buffsDano.fontesMgeral.map((fnt, idx) => <div key={idx} style={{ color: '#0f0', fontSize: '0.7em' }}>• {fnt}</div>)}
                        </div>
                    )}
                </div>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Mult Formas {buffsDano._hasBuff.mformas && <span style={{ color: '#0f0', fontSize: '0.8em' }}>(Buff: +{buffsDano.mformas.toFixed(2)})</span>}</label>
                    <input className="input-neon" type="number" step="0.01" value={dmFormas} onChange={e => setDmFormas(e.target.value)} />
                </div>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Mult Absoluto {buffsDano._hasBuff.mabs && <span style={{ color: '#0f0', fontSize: '0.8em' }}>(Buff: +{buffsDano.mabs.toFixed(2)})</span>}</label>
                    <input className="input-neon" type="number" step="0.01" value={dmAbsoluto} onChange={e => setDmAbsoluto(e.target.value)} />
                </div>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Mult Unico {buffsDano.munico.length > 0 && <span style={{ color: '#0f0', fontSize: '0.8em', textShadow: '0 0 5px rgba(0,255,0,0.5)' }}>(Buff: x{buffsDano.munico.join(' e x')})</span>}</label>
                    <input className="input-neon" type="text" value={dmUnico} onChange={e => setDmUnico(e.target.value)} />
                </div>
                <div style={{ gridColumn: 'span 3', background: 'rgba(0, 255, 170, 0.05)', padding: '10px', borderRadius: '5px', borderLeft: '3px solid #00ffaa' }}>
                    <label style={{ color: '#00ffaa', fontSize: '0.85em', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Dano Bruto Adicional (+) (Acumulado de Anomalias)</label>
                    <input className="input-neon" type="number" step="0.01" value={danoBruto} onChange={e => setDanoBruto(e.target.value)} style={{ width: '100%', borderColor: '#00ffaa', color: '#00ffaa', fontSize: '1.2em', fontWeight: 'bold' }} />
                    <p style={{ color: '#aaa', fontSize: '0.75em', margin: '5px 0 0 0', fontStyle: 'italic' }}>Este valor soma-se diretamente à energia gasta nos seus ataques.</p>
                </div>
            </div>
            <button className="btn-neon btn-gold" onClick={salvarMultiplicadores} style={{ marginTop: 15, width: '100%', backgroundColor: salvandoMult ? 'rgba(0, 255, 100, 0.2)' : undefined, borderColor: salvandoMult ? '#00ffcc' : undefined, color: salvandoMult ? '#fff' : undefined }}>{salvandoMult ? 'SALVO COM SUCESSO!' : 'SALVAR MULTIPLICADORES'}</button>
        </div>
    );
}

export function FichaControlePaineis() {
    const ctx = useFichaForm();
    if (!ctx) return null;
    const { painelForcado, setPainelForcado } = ctx;

    return (
        <div className="def-box fade-in" style={{ marginTop: 15, background: 'rgba(10, 15, 20, 0.8)', border: '1px solid #444', borderLeft: '3px solid #00ffcc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <label style={{ color: '#fff', fontSize: '0.9em', fontWeight: 'bold' }}>
                    👁️ Forçar Painel de Domínio Místico:
                    <span style={{ display: 'block', color: '#aaa', fontSize: '0.8em', fontWeight: 'normal', marginTop: '4px' }}>
                        Use este menu se quiser abrir a Forja, o Reator ou outro painel sem precisar ativar o poder, ou se o automático falhar.
                    </span>
                </label>
                <select className="input-neon" value={painelForcado} onChange={e => setPainelForcado(e.target.value)} style={{ width: 'auto', flex: 1, minWidth: '250px', margin: 0, borderColor: painelForcado !== 'auto' ? '#00ffcc' : '#444', color: painelForcado !== 'auto' ? '#00ffcc' : '#aaa' }}>
                    <option value="auto">🤖 Automático (Lê Poderes Ativos)</option>
                    <option value="acumulativo">📈 Acumulativo (Marcadores e Forja)</option>
                    <option value="elemental">🌪️ Elemental (Reator de Ressonância)</option>
                    <option value="conceitual">🧩 Conceitual (Leis da Cena)</option>
                    <option value="utilitario">🛠️ Utilitário (Mimetismo e Suporte)</option>
                    <option value="nenhum">❌ Ocultar Todos</option>
                </select>
            </div>
        </div>
    );
}