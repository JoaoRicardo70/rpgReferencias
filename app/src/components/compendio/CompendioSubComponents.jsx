import React from 'react';
import { useCompendioForm } from './CompendioFormContext';

const FALLBACK = <div style={{ color: '#888', padding: 10 }}>Compendio provider nao encontrado</div>;

// 🔥 TABELA PRÉ-PRONTA DE EMOJIS 🔥
const PRESET_EMOJIS = [
    '⚔️', '🔥', '💧', '⚡', '❄️', '☀️', '🌑', '🩸', '🤢', '🐢', '⛓️', '☠️', 
    '🛡️', '👻', '🌀', '💀', '🙈', '🗿', '💖', '💢', '✨', '🔮', '🏹', '🗡️', 
    '🌟', '👁️', '🎭', '🐙', '⚖️', '🏇', '💨', '🌿', '🍄', '🦠', '🧬'
];

/* ── Sidebar de Navegacao ── */
export function CompendioSidebar() {
    const ctx = useCompendioForm();
    if (!ctx) return FALLBACK;
    const { secaoAtiva, setSecaoAtiva } = ctx;

    return (
        <div style={{ flex: '0 0 220px', background: 'rgba(0,0,0,0.6)', padding: '20px', borderRadius: '8px', border: '1px solid #00ffcc', boxShadow: '0 0 15px rgba(0, 255, 204, 0.1)' }}>
            <h3 style={{ color: '#00ffcc', marginTop: 0, textAlign: 'center', borderBottom: '1px solid #00ffcc', paddingBottom: '15px', letterSpacing: '2px' }}>📖 GRIMÓRIO</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
                <button className={`btn-neon ${secaoAtiva === 'grands' ? 'btn-gold' : ''}`} onClick={() => setSecaoAtiva('grands')} style={{ textAlign: 'left', paddingLeft: '15px', fontWeight: 'bold' }}>🏛️ Trono dos Heróis</button>
                <button className={`btn-neon ${secaoAtiva === 'classes' ? 'btn-gold' : ''}`} onClick={() => setSecaoAtiva('classes')} style={{ textAlign: 'left', paddingLeft: '15px' }}>🛡️ Classes Regulares</button>
                <button className={`btn-neon ${secaoAtiva === 'condicoes' ? 'btn-gold' : ''}`} onClick={() => setSecaoAtiva('condicoes')} style={{ textAlign: 'left', paddingLeft: '15px' }}>🩸 Condições</button>
                <button className={`btn-neon ${secaoAtiva === 'elementos' ? 'btn-gold' : ''}`} onClick={() => setSecaoAtiva('elementos')} style={{ textAlign: 'left', paddingLeft: '15px' }}>⚔️ Tipos de Dano</button>
                <button className={`btn-neon ${secaoAtiva === 'regras' ? 'btn-gold' : ''}`} onClick={() => setSecaoAtiva('regras')} style={{ textAlign: 'left', paddingLeft: '15px' }}>📜 Regras da Casa</button>
            </div>
        </div>
    );
}

/* ── Card de Classe (com edicao inline) ── */
export function CompendioClasseCard({ classe }) {
    const ctx = useCompendioForm();
    if (!ctx) return FALLBACK;
    const {
        isMestre, editandoId, iniciarEdicao, cancelarEdicao, salvarEdicao,
        tempNome, setTempNome, tempTitulo, setTempTitulo,
        tempPassiva, setTempPassiva, tempDesc, setTempDesc,
        tempEfeito, setTempEfeito, tempIconeUrl,
        tempEfeitosMat, handleEfMat, addEfMat, removeEfMat, handleImageUpload, editandoItemTipo
    } = ctx;

    const isEditando = editandoId === classe.id && editandoItemTipo == null;

    return (
        <div style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${classe.cor}50`, borderLeft: `4px solid ${classe.cor}`, borderRadius: '5px', padding: '15px', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '50px', height: '50px', background: `${classe.cor}20`, borderRadius: '50%', border: `1px solid ${classe.cor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {classe.iconeUrl ? <img src={classe.iconeUrl} alt={classe.nome} style={{ width: '80%', height: '80%', objectFit: 'contain' }} /> : <span style={{ fontSize: '2em' }}>{classe.icone}</span>}
                    </div>
                    <div>
                        <h3 style={{ margin: 0, color: classe.cor, letterSpacing: '1px', textShadow: `0 0 5px ${classe.cor}80` }}>{classe.nome.toUpperCase()}</h3>
                        <div style={{ color: '#aaa', fontSize: '0.9em', fontStyle: 'italic' }}>{classe.titulo}</div>
                    </div>
                </div>
                {isMestre && !isEditando && (
                    <button className="btn-neon btn-gold btn-small" onClick={() => iniciarEdicao(classe)} style={{ padding: '4px 10px', fontSize: '0.8em', margin: 0 }}>✏️ Editar</button>
                )}
            </div>

            {isEditando ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                            <label style={{ fontSize: '0.8em', color: '#0088ff' }}>Nome da Classe:</label>
                            <input type="text" className="input-neon" value={tempNome} onChange={(e) => setTempNome(e.target.value)} style={{ width: '100%', padding: '5px', borderColor: '#0088ff', color: '#fff', fontWeight: 'bold' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.8em', color: '#aaa' }}>Título / Alcunha:</label>
                            <input type="text" className="input-neon" value={tempTitulo} onChange={(e) => setTempTitulo(e.target.value)} style={{ width: '100%', padding: '5px', borderColor: '#aaa', color: '#ccc', fontStyle: 'italic' }} />
                        </div>
                    </div>

                    {/* Motor Matematico */}
                    <div style={{ background: 'rgba(0, 255, 204, 0.05)', padding: '15px', borderRadius: '5px', border: '1px solid rgba(0, 255, 204, 0.3)' }}>
                        <h4 style={{ color: '#00ffcc', margin: '0 0 15px 0', fontSize: '0.9em', borderBottom: '1px solid #00ffcc40', paddingBottom: '5px' }}>⚙️ Motor Matemático (Efeitos Base)</h4>
                        {tempEfeitosMat.map((ef, idx) => (
                            <div key={idx} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '15px', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '4px', border: '1px solid #333' }}>
                                <div style={{ flex: '1 1 180px' }}>
                                    <label style={{ fontSize: '0.7em', color: '#ffcc00', display: 'block', marginBottom: '3px' }}>Tipo de Poder</label>
                                    <select className="input-neon" value={ef.propriedade} onChange={e => handleEfMat(idx, 'propriedade', e.target.value)} style={{ width: '100%', padding: '6px', background: '#111', color: '#ffcc00', border: '1px solid #ffcc00', borderRadius: '4px' }}>
                                        <option value="">Selecione um Poder...</option>
                                        <option value="munico">💥 Multiplicador Único (ex: x10)</option>
                                        <option value="mbase">📈 Multiplicador Base (ex: Status x2)</option>
                                        <option value="base">➕ Somar na Base (ex: Força +50)</option>
                                        <option value="bonus_acerto">🎯 Acerto Geral (Soma +X no d20)</option>
                                        <option value="proficiencia_arma">⚔️ Maestria com Arma (+ Acerto)</option>
                                        <option value="bonus_evasiva">🍃 Evasiva Passiva (+X)</option>
                                        <option value="bonus_resistencia">🛡️ Resistência Passiva (+X)</option>
                                        <option value="margem_critico">🩸 Margem de Crítico (Reduz o mínimo)</option>
                                        <option value="letalidade">☠️ Letalidade (+Dano Pós-Defesa)</option>
                                        <option value="furia_berserker">🩸 Fúria Berserker (+M.Geral por 1% HP Perdido)</option>
                                    </select>
                                </div>
                                <div style={{ flex: '1 1 140px' }}>
                                    <label style={{ fontSize: '0.7em', color: '#00ffcc', display: 'block', marginBottom: '3px' }}>
                                        {ef.propriedade === 'proficiencia_arma' ? 'Qual Arma?' : 'Qual Alvo? (ex: dano, forca)'}
                                    </label>
                                    {ef.propriedade === 'proficiencia_arma' ? (
                                        <select className="input-neon" value={ef.atributo} onChange={e => handleEfMat(idx, 'atributo', e.target.value)} style={{ width: '100%', padding: '6px', background: '#111', color: '#00ffcc', border: '1px solid #00ffcc', borderRadius: '4px' }}>
                                            <option value="">Escolha a Arma...</option>
                                            <option value="espada">Espada</option>
                                            <option value="arco">Arco</option>
                                            <option value="lança">Lança</option>
                                            <option value="machado">Machado</option>
                                            <option value="adaga">Adaga</option>
                                            <option value="cajado">Cajado</option>
                                            <option value="arma de fogo">Arma de Fogo</option>
                                            <option value="manopla">Manopla / Punhos</option>
                                            <option value="foice">Foice</option>
                                            <option value="chicote">Chicote</option>
                                            <option value="martelo">Martelo</option>
                                            <option value="escudo">Escudo</option>
                                        </select>
                                    ) : (
                                        <input type="text" placeholder={ef.propriedade === 'furia_berserker' ? "dano, todos_status..." : "dano, forca, geral"} value={ef.atributo} onChange={e => handleEfMat(idx, 'atributo', e.target.value)} className="input-neon" style={{ width: '100%', padding: '6px', borderColor: '#00ffcc' }} />
                                    )}
                                </div>
                                <div style={{ flex: '0 0 80px' }}>
                                    <label style={{ fontSize: '0.7em', color: '#fff', display: 'block', marginBottom: '3px' }}>Valor</label>
                                    <input type="text" placeholder="Ex: 10" value={ef.valor} onChange={e => handleEfMat(idx, 'valor', e.target.value)} className="input-neon" style={{ width: '100%', padding: '6px', borderColor: '#fff' }} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                    <button className="btn-neon btn-red" onClick={() => removeEfMat(idx)} style={{ padding: '6px 12px', margin: 0, height: '34px' }}>X</button>
                                </div>
                            </div>
                        ))}
                        <button className="btn-neon btn-small" onClick={addEfMat} style={{ marginTop: '5px', fontSize: '0.8em', width: '100%', borderStyle: 'dashed' }}>
                            + ADICIONAR NOVA REGRA MATEMÁTICA
                        </button>
                    </div>

                    <div style={{ background: 'rgba(255, 204, 0, 0.1)', padding: '10px', borderRadius: '5px', border: '1px solid rgba(255, 204, 0, 0.3)' }}>
                        <label style={{ fontSize: '0.8em', color: '#ffcc00', display: 'block', marginBottom: '5px' }}>Anexar Ícone (Upload do Computador):</label>
                        <input type="file" accept="image/*" onChange={handleImageUpload} style={{ color: '#fff', fontSize: '0.9em' }} />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.8em', color: '#ffcc00' }}>Habilidade de Classe:</label>
                        <input type="text" className="input-neon" value={tempPassiva} onChange={(e) => setTempPassiva(e.target.value)} style={{ width: '100%', padding: '5px', borderColor: '#ffcc00', color: '#fff' }} />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.8em', color: '#aaa' }}>Descrição (História / Lore):</label>
                        <textarea className="input-neon" value={tempDesc} onChange={(e) => setTempDesc(e.target.value)} style={{ width: '100%', padding: '5px', minHeight: '60px', borderColor: '#444', color: '#ccc', fontStyle: 'italic' }} />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.8em', color: '#00ffcc' }}>Efeitos Mecânicos (Regras Visuais):</label>
                        <textarea className="input-neon" value={tempEfeito} onChange={(e) => setTempEfeito(e.target.value)} style={{ width: '100%', padding: '5px', minHeight: '60px', borderColor: '#00ffcc', color: '#fff' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '5px' }}>
                        <button className="btn-neon btn-red btn-small" onClick={cancelarEdicao} style={{ margin: 0 }}>Cancelar</button>
                        <button className="btn-neon btn-green btn-small" onClick={() => salvarEdicao(classe.id)} style={{ margin: 0 }}>💾 Guardar Regras</button>
                    </div>
                </div>
            ) : (
                <>
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '4px', borderLeft: '2px solid #fff' }}>
                        <strong style={{ color: '#fff', fontSize: '0.85em', textTransform: 'uppercase' }}>Habilidade de Classe: </strong>
                        <span style={{ color: '#ffcc00', fontSize: '0.9em' }}>{classe.passiva}</span>
                    </div>
                    <p style={{ margin: '5px 0 0 0', color: '#aaa', fontSize: '0.85em', fontStyle: 'italic', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>"{classe.desc}"</p>
                    <div style={{ background: 'rgba(0, 255, 204, 0.05)', padding: '10px', borderRadius: '5px', border: '1px solid rgba(0, 255, 204, 0.3)', marginTop: '5px' }}>
                        <div style={{ color: '#00ffcc', fontSize: '0.75em', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '1px' }}>Efeitos da Classe</div>
                        <div style={{ color: '#fff', fontSize: '0.9em', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>⚔️ {classe.efeito}</div>
                    </div>
                </>
            )}
        </div>
    );
}

export function CompendioClassesGrid() {
    const ctx = useCompendioForm();
    if (!ctx) return FALLBACK;
    const { regulares, extras, isMestre } = ctx;

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid #ffcc00', paddingBottom: '10px', marginBottom: '30px' }}>
                <h2 style={{ color: '#ffcc00', margin: 0, textShadow: '0 0 10px #ffcc00' }}>🛡️ O Trono dos Heróis: Classes</h2>
                {isMestre && <span style={{ color: '#888', fontStyle: 'italic', fontSize: '0.8em' }}>Modo de Edição de Mestre Ativo 👑</span>}
            </div>
            <h3 style={{ color: '#0088ff', borderBottom: '1px dotted #0088ff', paddingBottom: '5px' }}>🌟 Classes Regulares</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', marginBottom: '40px' }}>
                {regulares.map((classe, i) => <CompendioClasseCard key={i} classe={classe} />)}
            </div>
            <h3 style={{ color: '#ff00ff', borderBottom: '1px dotted #ff00ff', paddingBottom: '5px' }}>✨ Classes Extra (Irregulares)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {extras.map((classe, i) => <CompendioClasseCard key={i} classe={classe} />)}
            </div>
        </div>
    );
}

export function CompendioGrandCard({ classe }) {
    const ctx = useCompendioForm();
    if (!ctx) return FALLBACK;
    const { isMestre, grands, mesaGrand, opcoesPersonagensPorMesa, handleDefinirGrand, handleAdicionarCandidato, handleRemoverCandidato, handleDefinirIconeGrand, limparIconeGrand } = ctx;

    const titular = grands[`${classe.id}_${mesaGrand}`] || '';
    const customIcon = grands[`${classe.id}_${mesaGrand}_icone`];
    const candidatos = grands[`${classe.id}_${mesaGrand}_candidatos`] || [];
    const isVago = !titular;

    const iconDisplay = customIcon ? (
        <img src={customIcon} alt={titular || classe.nome} style={{ width: '85px', height: '85px', objectFit: 'cover', borderRadius: '50%', border: `2px solid ${classe.cor}`, boxShadow: `0 0 15px ${classe.cor}` }} />
    ) : (
        classe.iconeUrl ? <img src={classe.iconeUrl} alt={classe.nome} style={{ width: '60px', height: '60px', objectFit: 'contain' }} /> : classe.icone
    );

    const disponiveisCandidatos = opcoesPersonagensPorMesa.filter(n => n !== titular && !candidatos.includes(n));

    return (
        <div style={{ background: isVago ? 'rgba(0,0,0,0.8)' : 'linear-gradient(135deg, rgba(255,204,0,0.15), rgba(0,0,0,0.9))', border: `1px solid ${isVago ? '#444' : '#ffcc00'}`, padding: '20px', borderRadius: '10px', textAlign: 'center', boxShadow: isVago ? 'none' : '0 0 20px rgba(255,204,0,0.2)', transition: 'all 0.3s', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            {isMestre && (
                <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '5px' }}>
                    {customIcon && <button className="btn-neon btn-red btn-small" onClick={() => limparIconeGrand(classe.id)} style={{ padding: '4px', margin: 0, fontSize: '0.6em' }}>❌</button>}
                    <label className="btn-neon btn-gold btn-small" style={{ cursor: 'pointer', padding: '4px 8px', margin: 0, fontSize: '0.7em' }}>
                        📸 <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleDefinirIconeGrand(classe.id, e)} />
                    </label>
                </div>
            )}
            <div style={{ fontSize: '3em', textShadow: isVago ? 'none' : `0 0 15px ${classe.cor}`, filter: isVago && !customIcon ? 'grayscale(100%) opacity(50%)' : 'none', minHeight: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {iconDisplay}
            </div>
            <h3 style={{ color: isVago ? '#888' : '#ffcc00', margin: '15px 0 5px 0', letterSpacing: '2px', textShadow: isVago ? 'none' : '0 0 10px rgba(255,204,0,0.5)' }}>GRAND {classe.nome.toUpperCase()}</h3>
            <div style={{ color: '#aaa', fontSize: '0.75em', fontStyle: 'italic', marginBottom: '15px', flex: 1 }}>{classe.titulo}</div>

            <div style={{ padding: '15px 10px', background: 'rgba(0,0,0,0.5)', borderRadius: '5px', borderTop: `2px solid ${isVago ? '#333' : '#ffcc00'}` }}>
                <div style={{ fontSize: '0.7em', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '5px' }}>Receptáculo Divino</div>
                {isMestre ? (
                    <select className="input-neon" value={titular} onChange={(e) => handleDefinirGrand(classe.id, e.target.value)} style={{ width: '100%', borderColor: isVago ? '#444' : '#ffcc00', color: isVago ? '#888' : '#fff', fontWeight: 'bold', textAlign: 'center', background: '#111' }}>
                        <option value="">-- TRONO VAGO --</option>
                        {opcoesPersonagensPorMesa.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                ) : (
                    <div style={{ fontSize: '1.4em', fontWeight: 'bold', color: isVago ? '#555' : '#fff', textShadow: isVago ? 'none' : '0 0 10px #ffcc00', letterSpacing: '1px' }}>{isVago ? 'VAGO' : titular}</div>
                )}
            </div>

            <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(0, 136, 255, 0.1)', borderRadius: '5px', borderTop: '2px solid #0088ff' }}>
                <div style={{ fontSize: '0.7em', color: '#0088ff', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', fontWeight: 'bold' }}>🌟 Candidatos ao Trono</div>
                {candidatos.length === 0 ? (
                    <div style={{ fontSize: '0.85em', color: '#666', fontStyle: 'italic' }}>Nenhum candidato reconhecido.</div>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', justifyContent: 'center' }}>
                        {candidatos.map(c => (
                            <div key={c} style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid #0088ff', color: '#00ccff', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                {c} {isMestre && <span style={{ cursor: 'pointer', color: '#ff003c', fontWeight: 'bold', marginLeft: '3px' }} onClick={() => handleRemoverCandidato(classe.id, c)}>×</span>}
                            </div>
                        ))}
                    </div>
                )}
                {isMestre && disponiveisCandidatos.length > 0 && (
                    <select className="input-neon" onChange={(e) => { handleAdicionarCandidato(classe.id, e.target.value); e.target.value = ""; }} style={{ width: '100%', borderColor: '#0088ff', color: '#fff', marginTop: '10px', fontSize: '0.8em', padding: '4px' }} defaultValue="">
                        <option value="" disabled>+ Nomear Candidato...</option>
                        {disponiveisCandidatos.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                )}
            </div>
        </div>
    );
}

export function CompendioGrandsSecao() {
    const ctx = useCompendioForm();
    if (!ctx) return FALLBACK;
    const { isMestre, mesaGrand, setMesaGrand, todasClasses } = ctx;

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid #ffcc00', paddingBottom: '10px', marginBottom: '20px' }}>
                <h2 style={{ color: '#ffcc00', margin: 0, textShadow: '0 0 15px #ffcc00', letterSpacing: '2px' }}>🏛️ O Trono da Ascensão</h2>
                {isMestre && <span style={{ color: '#ffcc00', fontStyle: 'italic', fontSize: '0.8em' }}>O Árbitro do Destino 👑</span>}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
                <button className={`btn-neon ${mesaGrand === 'presente' ? 'btn-gold' : ''}`} onClick={() => setMesaGrand('presente')} style={{ flex: 1, padding: '10px', fontSize: '1em', margin: 0 }}>⚔️ Lendas do Presente</button>
                <button className={`btn-neon ${mesaGrand === 'futuro' ? 'btn-gold' : ''}`} onClick={() => setMesaGrand('futuro')} style={{ flex: 1, padding: '10px', fontSize: '1em', margin: 0 }}>🚀 Lendas do Futuro</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '25px' }}>
                {todasClasses.map((classe) => <CompendioGrandCard key={classe.id} classe={classe} />)}
            </div>
        </div>
    );
}

/* ── Secao Dinamica de Edicao Generica (COM COLOR PICKER E EMOJIS) ── */
export function CompendioEditorItem({ tituloForm }) {
    const ctx = useCompendioForm();
    if (!ctx) return null;
    const { tempItem, updateTempItem, salvarItem, cancelarEdicaoItem } = ctx;

    return (
        <div className="def-box fade-in" style={{ padding: '20px', border: '1px solid #00ffcc', background: 'rgba(20,20,30,0.9)', gridColumn: '1 / -1', marginBottom: 20 }}>
            <h3 style={{ color: '#00ffcc', marginTop: 0 }}>✏️ Forjando: {tituloForm}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div>
                        <label style={{ fontSize: '0.8em', color: '#aaa', marginBottom: 5, display: 'block' }}>Nome / Título:</label>
                        <input type="text" className="input-neon" value={tempItem.nome || tempItem.titulo || ''} onChange={(e) => updateTempItem(tempItem.nome !== undefined ? 'nome' : 'titulo', e.target.value)} style={{ width: '100%', padding: '8px' }} />
                    </div>
                    {tempItem.cor !== undefined && (
                        <div>
                            <label style={{ fontSize: '0.8em', color: '#aaa', marginBottom: 5, display: 'block' }}>Cor Temática:</label>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                {/* 🔥 O NOVO COLOR PICKER MÁGICO 🔥 */}
                                <div style={{ position: 'relative', width: '40px', height: '36px', borderRadius: '4px', overflow: 'hidden', border: `1px solid ${tempItem.cor || '#fff'}` }}>
                                    <input type="color" value={tempItem.cor || '#ffffff'} onChange={(e) => updateTempItem('cor', e.target.value)} style={{ position: 'absolute', top: '-10px', left: '-10px', width: '60px', height: '60px', cursor: 'pointer', border: 'none' }} title="Clique para escolher a cor"/>
                                </div>
                                <input type="text" className="input-neon" value={tempItem.cor || '#ffffff'} onChange={(e) => updateTempItem('cor', e.target.value)} style={{ flex: 1, padding: '8px', color: tempItem.cor || '#fff', borderColor: tempItem.cor || '#fff' }} placeholder="#ffffff" />
                            </div>
                        </div>
                    )}
                </div>

                {tempItem.icone !== undefined && (
                    <div style={{ background: 'rgba(0,0,0,0.4)', padding: '10px', borderRadius: '5px', border: '1px dashed #555' }}>
                        <label style={{ fontSize: '0.8em', color: '#00ffcc', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                            <span>Ícone (Emoji):</span>
                            <input type="text" className="input-neon" value={tempItem.icone || ''} onChange={(e) => updateTempItem('icone', e.target.value)} style={{ width: '60px', padding: '4px', textAlign: 'center', fontSize: '1.2em' }} placeholder="❔" />
                        </label>
                        {/* 🔥 A TABELA PRÉ-PRONTA DE EMOJIS 🔥 */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '5px', maxHeight: '100px', overflowY: 'auto' }}>
                            {PRESET_EMOJIS.map(emj => (
                                <button key={emj} onClick={() => updateTempItem('icone', emj)} style={{ background: tempItem.icone === emj ? 'rgba(0, 255, 204, 0.3)' : 'transparent', border: `1px solid ${tempItem.icone === emj ? '#00ffcc' : '#444'}`, borderRadius: '4px', cursor: 'pointer', fontSize: '1.3em', padding: '4px 8px', transition: '0.2s' }} title={`Selecionar ${emj}`}>
                                    {emj}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div>
                    <label style={{ fontSize: '0.8em', color: '#aaa', marginBottom: 5, display: 'block' }}>Descrição das Mecânicas:</label>
                    <textarea className="input-neon" value={tempItem.desc || ''} onChange={(e) => updateTempItem('desc', e.target.value)} style={{ width: '100%', padding: '10px', minHeight: '80px', resize: 'vertical' }} placeholder="Descreva aqui o que essa condição/elemento/regra faz na mesa..." />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                    <button className="btn-neon btn-red" onClick={cancelarEdicaoItem} style={{ margin: 0, padding: '8px 20px' }}>Cancelar</button>
                    <button className="btn-neon btn-green" onClick={salvarItem} style={{ margin: 0, padding: '8px 20px', fontWeight: 'bold' }}>💾 Salvar Alterações</button>
                </div>
            </div>
        </div>
    );
}


/* ── Secoes Dinamicas Mapeadas ── */

export function CompendioCondicoes() {
    const ctx = useCompendioForm();
    if (!ctx) return FALLBACK;
    const { condicoes, isMestre, editandoItemTipo, iniciarEdicaoItem, deletarItem } = ctx;

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #ff4444', paddingBottom: '10px' }}>
                <h2 style={{ color: '#ff4444', margin: 0, textShadow: '0 0 15px rgba(255,68,68,0.5)', letterSpacing: '2px' }}>🩸 CONDIÇÕES & DEBUFFS</h2>
                {isMestre && <button className="btn-neon btn-red btn-small" onClick={() => iniciarEdicaoItem('condicoes', { id: `cond_${Date.now()}`, nome: 'Nova Condição', icone: '❔', cor: '#ffffff', desc: 'Descrição da condição' })} style={{ margin: 0 }}>+ CRIAR CONDIÇÃO</button>}
            </div>

            {editandoItemTipo === 'condicoes' && <CompendioEditorItem tituloForm="Condição de Status" />}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
                {condicoes.map(cond => (
                    <div key={cond.id} className="def-box" style={{ padding: '20px', borderLeft: `4px solid ${cond.cor}`, background: 'rgba(0,0,0,0.5)', position: 'relative' }}>
                        {isMestre && (
                            <div style={{ position: 'absolute', top: 5, right: 5, display: 'flex', gap: 5 }}>
                                <button onClick={() => iniciarEdicaoItem('condicoes', cond)} style={{ background: 'none', border: 'none', color: '#ffcc00', cursor: 'pointer' }}>✏️</button>
                                <button onClick={() => deletarItem('condicoes', cond.id)} style={{ background: 'none', border: 'none', color: '#ff003c', cursor: 'pointer' }}>✖</button>
                            </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                            <div style={{ fontSize: '2.5em' }}>{cond.icone}</div>
                            <div>
                                <h3 style={{ color: cond.cor, margin: '0 0 5px 0', textTransform: 'uppercase', textShadow: `0 0 5px ${cond.cor}80` }}>{cond.nome}</h3>
                            </div>
                        </div>
                        <div style={{ color: '#ccc', fontSize: '0.85em', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{cond.desc}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function CompendioElementos() {
    const ctx = useCompendioForm();
    if (!ctx) return FALLBACK;
    const { elementos, isMestre, editandoItemTipo, iniciarEdicaoItem, deletarItem } = ctx;

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #00ffcc', paddingBottom: '10px' }}>
                <h2 style={{ color: '#00ffcc', margin: 0, textShadow: '0 0 15px rgba(0,255,204,0.5)', letterSpacing: '2px' }}>🔥 TIPOS DE DANO & AFINIDADES</h2>
                {isMestre && <button className="btn-neon btn-green btn-small" onClick={() => iniciarEdicaoItem('elementos', { id: `elem_${Date.now()}`, nome: 'Novo Elemento', icone: '✨', cor: '#ffffff', desc: 'Descrição elemental' })} style={{ margin: 0 }}>+ CRIAR ELEMENTO</button>}
            </div>

            {editandoItemTipo === 'elementos' && <CompendioEditorItem tituloForm="Tipo de Dano Elemental" />}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                {elementos.map(el => (
                    <div key={el.id} className="def-box" style={{ padding: '20px', borderTop: `4px solid ${el.cor}`, background: 'rgba(0,0,0,0.5)', position: 'relative' }}>
                        {isMestre && (
                            <div style={{ position: 'absolute', top: 5, right: 5, display: 'flex', gap: 5 }}>
                                <button onClick={() => iniciarEdicaoItem('elementos', el)} style={{ background: 'none', border: 'none', color: '#ffcc00', cursor: 'pointer' }}>✏️</button>
                                <button onClick={() => deletarItem('elementos', el.id)} style={{ background: 'none', border: 'none', color: '#ff003c', cursor: 'pointer' }}>✖</button>
                            </div>
                        )}
                        <h3 style={{ color: el.cor, margin: '0 0 5px 0', textShadow: `0 0 10px ${el.cor}80` }}>{el.icone} {el.nome}</h3>
                        <p style={{ color: '#aaa', fontSize: '0.85em', margin: 0, whiteSpace: 'pre-wrap' }}>{el.desc}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function CompendioRegras() {
    const ctx = useCompendioForm();
    if (!ctx) return FALLBACK;
    const { regras, isMestre, editandoItemTipo, iniciarEdicaoItem, deletarItem } = ctx;

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #ff00ff', paddingBottom: '10px' }}>
                <h2 style={{ color: '#ff00ff', margin: 0, textShadow: '0 0 15px rgba(255,0,255,0.5)', letterSpacing: '2px' }}>⚖️ REGRAS DA CASA</h2>
                {isMestre && <button className="btn-neon btn-small" onClick={() => iniciarEdicaoItem('regras', { id: `regra_${Date.now()}`, titulo: 'Nova Lei', cor: '#ffffff', desc: 'Regra de funcionamento' })} style={{ margin: 0, borderColor: '#ff00ff', color: '#ff00ff' }}>+ DECRETAR REGRA</button>}
            </div>

            {editandoItemTipo === 'regras' && <CompendioEditorItem tituloForm="Regra da Casa" />}

            <div className="def-box" style={{ padding: '20px', background: 'rgba(255,0,255,0.05)', border: '1px solid #ff00ff' }}>
                <h3 style={{ color: '#ff00ff', margin: '0 0 15px 0' }}>O Tratado do Multiverso</h3>
                <ul style={{ color: '#ccc', fontSize: '0.9em', lineHeight: '1.8', margin: 0, paddingLeft: '20px' }}>
                    {regras.map(reg => (
                        <li key={reg.id} style={{ marginBottom: '10px', position: 'relative' }}>
                            {isMestre && (
                                <span style={{ position: 'absolute', left: '-45px', display: 'flex', gap: '5px' }}>
                                    <button onClick={() => iniciarEdicaoItem('regras', reg)} style={{ background: 'none', border: 'none', color: '#ffcc00', cursor: 'pointer', fontSize: '1em', padding: 0 }} title="Editar">✏️</button>
                                    <button onClick={() => deletarItem('regras', reg.id)} style={{ background: 'none', border: 'none', color: '#ff003c', cursor: 'pointer', fontSize: '1em', padding: 0 }} title="Deletar">✖</button>
                                </span>
                            )}
                            <strong style={{color: reg.cor || '#00ffcc'}}>{reg.titulo}:</strong> {reg.desc}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}