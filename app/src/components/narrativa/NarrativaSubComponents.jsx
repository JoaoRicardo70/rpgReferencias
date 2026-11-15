import React from 'react';
import { useNarrativaForm, ATRIBUTO_OPTIONS, PROPRIEDADE_OPTIONS } from './NarrativaFormContext';
import SeletorRaca from '../shared/SeletorRaca';

const FALLBACK = <div style={{ color: '#888', padding: 10 }}>Narrativa provider não encontrado</div>;

export function NarrativaBioForm() {
    const ctx = useNarrativaForm();
    if (!ctx) return FALLBACK;
    const { raca, setRaca, classe, setClasse, idade, setIdade, fisico, setFisico, sangue, setSangue, alinhamento, setAlinhamento, afiliacao, setAfiliacao, dinheiro, setDinheiro, salvando, salvarBio } = ctx;

    return (
        <>
            <div className="def-box">
                <h3 style={{ color: '#ffcc00', marginBottom: 10 }}>Ficha Narrativa</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <SeletorRaca valor={raca} aoMudar={setRaca} />
                    <div><label style={{ color: '#aaa', fontSize: '0.85em' }}>Classe</label><input className="input-neon" value={classe} onChange={e => setClasse(e.target.value)} /></div>
                    <div><label style={{ color: '#aaa', fontSize: '0.85em' }}>Idade</label><input className="input-neon" value={idade} onChange={e => setIdade(e.target.value)} /></div>
                    <div><label style={{ color: '#aaa', fontSize: '0.85em' }}>Físico</label><input className="input-neon" value={fisico} onChange={e => setFisico(e.target.value)} /></div>
                    <div><label style={{ color: '#aaa', fontSize: '0.85em' }}>Tipo Sanguíneo</label><input className="input-neon" value={sangue} onChange={e => setSangue(e.target.value)} /></div>
                    <div><label style={{ color: '#aaa', fontSize: '0.85em' }}>Alinhamento</label><input className="input-neon" value={alinhamento} onChange={e => setAlinhamento(e.target.value)} /></div>
                    <div><label style={{ color: '#aaa', fontSize: '0.85em' }}>Afiliação</label><input className="input-neon" value={afiliacao} onChange={e => setAfiliacao(e.target.value)} /></div>
                    <div><label style={{ color: '#aaa', fontSize: '0.85em' }}>Dinheiro</label><input className="input-neon" value={dinheiro} onChange={e => setDinheiro(e.target.value)} /></div>
                </div>
            </div>
            <button className="btn-neon btn-gold" onClick={salvarBio} style={{ marginTop: 15, width: '100%', backgroundColor: salvando ? 'rgba(0, 255, 100, 0.2)' : undefined, borderColor: salvando ? '#00ffcc' : undefined, color: salvando ? '#fff' : undefined }}>
                {salvando ? 'SALVO COM SUCESSO!' : 'Salvar Bio'}
            </button>
        </>
    );
}

export function NarrativaPassivasEditor() {
    const ctx = useNarrativaForm();
    if (!ctx) return FALLBACK;
    const { editIndex, passivaNome, setPassivaNome, passivaTipo, setPassivaTipo, nomeEfeito, setNomeEfeito, novoAtr, setNovoAtr, novoProp, setNovoProp, novoVal, setNovoVal, addEfeitoPassiva, efeitosTempPassiva, removerEfeitoPassiva, salvarPassiva, cancelarEdicao } = ctx;

    return (
        <div id="painel-edicao-passiva" className="def-box" style={{ marginTop: 15 }}>
            <h3 style={{ color: editIndex >= 0 ? '#0ff' : '#f0f', marginBottom: 10 }}>{editIndex >= 0 ? 'Editando Passiva/Vantagem' : 'Sistema de Passivas'}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <div><label style={{ color: '#aaa', fontSize: '0.85em' }}>Nome da Passiva</label><input className="input-neon" value={passivaNome} onChange={e => setPassivaNome(e.target.value)} /></div>
                <div><label style={{ color: '#aaa', fontSize: '0.85em' }}>Tipo</label><select className="input-neon" value={passivaTipo} onChange={e => setPassivaTipo(e.target.value)}><option value="Vantagem">Vantagem</option><option value="Habilidade">Habilidade</option></select></div>
            </div>
            <input className="input-neon" type="text" placeholder="Nome do Efeito" value={nomeEfeito} onChange={e => setNomeEfeito(e.target.value)} style={{ marginTop: 10 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8, marginTop: 5 }}>
                <select className="input-neon" value={novoAtr} onChange={e => setNovoAtr(e.target.value)}>{ATRIBUTO_OPTIONS.map(a => <option key={a} value={a}>{a.toUpperCase()}</option>)}</select>
                <select className="input-neon" value={novoProp} onChange={e => setNovoProp(e.target.value)}>{PROPRIEDADE_OPTIONS.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}</select>
                <input className="input-neon" type="text" placeholder="Valor" value={novoVal} onChange={e => setNovoVal(e.target.value)} />
                <button className="btn-neon btn-blue" onClick={addEfeitoPassiva} style={{ padding: '5px 10px' }}>+ Efeito</button>
            </div>
            <div style={{ marginTop: 10 }}>
                {efeitosTempPassiva.length === 0 ? (
                    <p style={{ color: '#888', fontSize: '0.9em', margin: 0 }}>Nenhum efeito adicionado.</p>
                ) : (
                    efeitosTempPassiva.map((e, i) => (
                        <div key={i} style={{ color: editIndex >= 0 ? '#0ff' : '#f0f', fontSize: '0.9em', marginBottom: 5, background: editIndex >= 0 ? 'rgba(0,255,255,0.1)' : 'rgba(255,0,255,0.1)', padding: '5px 10px', borderLeft: `2px solid ${editIndex >= 0 ? '#0ff' : '#f0f'}`, display: 'flex', justifyContent: 'space-between' }}>
                            <span><strong style={{ color: '#fff' }}>{e.nome || '(Sem nome)'}</strong> [{(e.atributo || '').toUpperCase()}] {(e.propriedade || '').toUpperCase()}: {e.valor}</span>
                            <button onClick={() => removerEfeitoPassiva(i)} style={{ background: 'transparent', color: '#f00', border: 'none', cursor: 'pointer' }}>X</button>
                        </div>
                    ))
                )}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: 10 }}>
                <button className="btn-neon" onClick={salvarPassiva} style={{ flex: 1, borderColor: editIndex >= 0 ? '#0ff' : '#f0f', color: editIndex >= 0 ? '#0ff' : '#f0f' }}>{editIndex >= 0 ? 'SALVAR EDIÇÃO' : 'ADICIONAR PASSIVA'}</button>
                {editIndex >= 0 && <button className="btn-neon btn-red" onClick={cancelarEdicao} style={{ flex: 0.5 }}>CANCELAR</button>}
            </div>
        </div>
    );
}

export function NarrativaPassivasLista() {
    const ctx = useNarrativaForm();
    if (!ctx) return FALLBACK;
    const { passivas, editarPassiva, removerPassiva } = ctx;

    return (
        <div id="lista-passivas" style={{ marginTop: 15 }}>
            {passivas.length === 0 ? (
                <p style={{ color: '#888', textAlign: 'center', fontStyle: 'italic' }}>Nenhuma habilidade listada.</p>
            ) : (
                passivas.map((p, i) => {
                    const corTag = p.tipo === 'Vantagem' ? '#ffcc00' : '#33ff77';
                    return (
                        <div key={i} style={{ background: 'rgba(0,0,0,0.6)', padding: '10px 12px', borderLeft: `3px solid ${corTag}`, borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                            <div>
                                <div>
                                    <span style={{ color: corTag, fontSize: '0.7em', textTransform: 'uppercase', fontWeight: 'bold', marginRight: 5 }}>[{p.tipo}]</span>
                                    <span style={{ color: 'white', fontWeight: 'bold', fontSize: '1.1em' }}>{p.nome}</span>
                                </div>
                                <div>
                                    {(p.efeitos || []).map((ef, j) => (
                                        <span key={j} style={{ display: 'inline-block', fontSize: '0.7em', background: 'rgba(0,0,0,0.8)', border: '1px solid #555', padding: '2px 5px', borderRadius: 4, marginRight: 4, marginTop: 4, color: '#aaa' }}>
                                            {(ef.propriedade || '').toUpperCase()} ({(ef.atributo || '').toUpperCase()}): {ef.valor}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                <button onClick={() => editarPassiva(i)} style={{ background: 'transparent', border: '1px solid #0ff', color: '#0ff', cursor: 'pointer', fontSize: '0.8em', padding: '3px 8px', borderRadius: '4px' }} title="Editar">EDITAR</button>
                                <button onClick={() => removerPassiva(i)} style={{ background: 'transparent', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '1.2em' }} title="Remover">X</button>
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}

export function NarrativaAuditoria() {
    const ctx = useNarrativaForm();
    if (!ctx) return FALLBACK;
    const { passivas } = ctx;

    const renderRelatorio = () => {
        if (!passivas || passivas.length === 0) return <span style={{ color: '#888', fontStyle: 'italic' }}>Nenhum efeito de passiva ativo.</span>;
        const mapaEfeitos = { mbase: [], mgeral: [], mformas: [], mabs: [], munico: [], base: [], especial: [] };
        const nomesProps = { mbase: 'MULT BASE (x)', mgeral: 'MULT GERAL (x)', mformas: 'MULT FORMA (x)', mabs: 'MULT ABSOLUTO (x)', munico: 'MULT UNICO (x)', base: 'VALOR BRUTO (+)' };

        passivas.forEach(p => {
            if (p.efeitos) p.efeitos.forEach(ef => {
                const txt = { nome: p.nome, atributo: ef.atributo, valor: ef.valor };
                if (mapaEfeitos[ef.propriedade]) mapaEfeitos[ef.propriedade].push(txt);
                else mapaEfeitos.especial.push(txt);
            });
        });

        let hasContent = false;
        const sections = [];
        for (const prop in nomesProps) {
            if (mapaEfeitos[prop].length > 0) {
                hasContent = true;
                sections.push(<div key={prop} style={{ marginBottom: 6 }}><strong style={{ color: '#f0f' }}>{nomesProps[prop]}:</strong>{' '}{mapaEfeitos[prop].map((t, i) => (<span key={i}>{i > 0 && <strong style={{ color: '#f0f' }}> + </strong>}<span style={{ color: '#fff' }}>{t.nome}</span><span style={{ color: '#555' }}> ({t.atributo.toUpperCase()}: {t.valor})</span></span>))}</div>);
            }
        }
        if (mapaEfeitos.especial.length > 0) {
            hasContent = true;
            sections.push(<div key="especial" style={{ marginBottom: 6 }}><strong style={{ color: '#0ff' }}>OUTROS EFEITOS:</strong>{' '}{mapaEfeitos.especial.map((t, i) => (<span key={i}>{i > 0 && <strong style={{ color: '#0ff' }}> + </strong>}<span style={{ color: '#fff' }}>{t.nome}</span><span style={{ color: '#555' }}> ({t.atributo.toUpperCase()}: {t.valor})</span></span>))}</div>);
        }
        if (!hasContent) return <span style={{ color: '#888', fontStyle: 'italic' }}>As passivas não possuem modificadores mecânicos configurados.</span>;
        return sections;
    };

    return (
        <div className="def-box" style={{ marginTop: 15 }}>
            <h3 style={{ color: '#0ff', marginBottom: 10 }}>Auditoria de Combos (Auto)</h3>
            <div id="painel-auditoria-auto" style={{ fontSize: '0.9em' }}>{renderRelatorio()}</div>
        </div>
    );
}