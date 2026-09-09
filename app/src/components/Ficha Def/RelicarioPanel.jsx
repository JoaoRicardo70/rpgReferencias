import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';
import { capturarMaximosAtuais, rescalarVitaisProporcional } from '../../core/vitals';

// ==========================================
// 🎲 CONSTANTES DE RPG (ITENS E ARMAS)
// ==========================================
const RARIDADES = {
    'comum': { label: '⚪ Comum', cor: '#cccccc' },
    'incomum': { label: '🟢 Incomum', cor: '#44ff44' },
    'raro': { label: '🔵 Raro', cor: '#00aaff' },
    'epico': { label: '🟣 Épico', cor: '#aa00ff' },
    'lendario': { label: '🟠 Lendário', cor: '#ffaa00' },
    'mitico': { label: '🔴 Mítico', cor: '#ff003c' },
    'divino': { label: '✨ Divino', cor: '#ffffcc' },
    'singular': { label: '🌌 Singularidade', cor: '#ff00ff' }
};

const TIPOS_ARSENAL = [
    { value: 'arma', label: '⚔️ Arma' },
    { value: 'armadura', label: '🛡️ Armadura / Vestimenta' },
    { value: 'acessorio', label: '💍 Acessório / Relíquia Menor' }
];

const TIPOS_SUPRIMENTO = [
    { value: 'consumivel', label: '🧪 Consumível / Poção' },
    { value: 'mundano', label: '🎒 Item Mundano / Recurso' }
];

const TIPOS_DANO = ['Cortante', 'Perfurante', 'Impacto', 'Mágico', 'Elemental', 'Verdadeiro', 'Conceitual', 'Espiritual', 'Nenhum'];

// ==========================================
// 📖 OS CAPÍTULOS DO RELICÁRIO
// ==========================================
const CAPITULOS = [
    { id: 'altar', label: 'Altar da Relíquia', icon: '🗡️' },
    { id: 'passivas', label: 'Estigmas & Runas', icon: '🪨' },
    { id: 'formas', label: 'Formas Base', icon: '🌌' },
    { id: 'verdadeiras', label: 'Formas Verdadeiras', icon: '👑' },
    { id: 'arsenal', label: 'Arsenal Místico', icon: '⚔️' },
    { id: 'suprimentos', label: 'Suprimentos & Notas', icon: '🧪' }
];

// 🗡️ Capítulos 1-4 documentam EXCLUSIVAMENTE a Arma Espiritual/Fantasma Nobre da entidade (a
// relíquia única e evolutiva, não um item comum do Arsenal) — armas comuns (espadas, armas de
// fogo, etc.) pertencem ao Arsenal Místico (Capítulo 5), nunca a estes 4 capítulos.
const CAPITULOS_ARMA_ESPIRITUAL = ['altar', 'passivas', 'formas', 'verdadeiras'];

// ==========================================
// 🧠 CONTEXTO ISOLADO DO RELICÁRIO
// ==========================================
const RelicarioContext = createContext(null);

export function useRelicario() {
    return useContext(RelicarioContext);
}

export function RelicarioProvider({ children }) {
    const minhaFicha = useStore(s => s.minhaFicha);
    const updateFicha = useStore(s => s.updateFicha);
    const isMestre = useStore(s => s.isMestre);
    const meuNome = useStore(s => s.meuNome);
    const [abaAtual, setAbaAtual] = useState('altar');

    const callSave = useCallback(() => { salvarFichaSilencioso(); }, []);

    useEffect(() => {
        if (minhaFicha && !minhaFicha.armaEspiritual) {
            updateFicha(f => {
                f.armaEspiritual = {
                    nome: '', epiteto: '', cantico: '', danoBase: '',
                    avatarHumano: '', avatarArma: '',
                    passivas: [], runas: [], formas: [], formasVerdadeiras: []
                };
            });
            callSave();
        }
    }, [minhaFicha, updateFicha, callSave]);

    const handleArrayItem = useCallback((chave, acao, index, campo, valor, subIndex = null, subCampo = null) => {
        updateFicha((ficha) => {
            // 🔥 CORREÇÃO DE BLINDAGEM: Se "notas" for texto/undefined antigo, força a ser Array
            if (chave === 'notas') {
                if (!Array.isArray(ficha.notas)) ficha.notas = [];
                if (acao === 'add') ficha.notas.push({ id: Date.now(), titulo: '', texto: '' });
                else if (acao === 'remove') ficha.notas.splice(index, 1);
                else if (acao === 'update' && ficha.notas[index]) ficha.notas[index][campo] = valor;
                return;
            }

            if (!ficha.armaEspiritual) return;
            const target = ficha.armaEspiritual[chave];
            
            if (acao === 'add') {
                if (chave === 'formas' || chave === 'formasVerdadeiras') target.push({ id: Date.now(), nome: '', dano: '', img: '', configs: [] });
                else target.push({ id: Date.now(), texto: '' });
            } 
            else if (acao === 'remove') target.splice(index, 1);
            else if (acao === 'update') target[index][campo] = valor;
            
            else if (acao === 'add-config') {
                if (!target[index].configs) target[index].configs = [];
                target[index].configs.push({ id: Date.now(), nome: '', desc: '', img: '' });
            }
            else if (acao === 'remove-config') target[index].configs.splice(subIndex, 1);
            else if (acao === 'update-config') target[index].configs[subIndex][subCampo] = valor;
        });
        callSave();
    }, [updateFicha, callSave]);

    const updateItemById = useCallback((id, campo, valor) => {
        updateFicha(f => { const i = f.inventario.find(x => x.id === id); if (i) i[campo] = valor; });
        callSave();
    }, [updateFicha, callSave]);

    const removeItemById = useCallback((id) => {
        if(window.confirm('Deitar fora este item para sempre?')) {
            updateFicha(f => {
                const oldM = capturarMaximosAtuais(f);
                f.inventario = f.inventario.filter(x => x.id !== id);
                rescalarVitaisProporcional(f, oldM);
            });
            callSave();
        }
    }, [updateFicha, callSave]);

    const toggleEquiparById = useCallback((id) => {
        updateFicha(f => {
            const i = f.inventario.find(x => x.id === id);
            if (!i) return;
            const oldM = capturarMaximosAtuais(f);
            i.equipado = !i.equipado;
            rescalarVitaisProporcional(f, oldM);
        });
        callSave();
    }, [updateFicha, callSave]);

    const addItem = useCallback((tipoPadrao) => {
        updateFicha(f => {
            if (!f.inventario) f.inventario = [];
            f.inventario.push({ 
                id: Date.now(), nome: '', quantidade: 1, peso: 0, desc: '', 
                tipo: tipoPadrao, raridade: 'comum', dano: '', tipoDano: 'Físico', equipado: false 
            });
        });
        callSave();
    }, [updateFicha, callSave]);

    const value = { 
        minhaFicha, updateFicha, isMestre, meuNome, abaAtual, setAbaAtual, callSave, handleArrayItem,
        updateItemById, removeItemById, toggleEquiparById, addItem 
    };
    return <RelicarioContext.Provider value={value}>{children}</RelicarioContext.Provider>;
}

// ==========================================
// 🖋️ COMPONENTES VISUAIS
// ==========================================
const CampoMagico = ({ valor, onChange, placeholder, styleExtra = {}, type = "text", disabled = false }) => {
    const { callSave } = useRelicario();
    return (
        <input 
            type={type} value={valor || ''} onChange={e => onChange(e.target.value)} 
            onBlur={callSave} placeholder={placeholder} disabled={disabled}
            style={{ background: 'transparent', border: 'none', borderBottom: '1px dashed currentColor', fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit', fontWeight: 'inherit', fontStyle: 'inherit', outline: 'none', padding: '5px', width: '100%', opacity: disabled ? 0.7 : 1, ...styleExtra }} 
        />
    );
};

const AreaMagica = ({ valor, onChange, placeholder, styleExtra = {}, disabled = false }) => {
    const { callSave } = useRelicario();
    return (
        <textarea 
            value={valor || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            onBlur={callSave} disabled={disabled}
            style={{ width: '100%', minHeight: '60px', background: 'transparent', border: 'none', borderBottom: '2px dotted currentColor', color: 'inherit', fontFamily: 'inherit', padding: '8px', outline: 'none', resize: 'vertical', opacity: disabled ? 0.7 : 1, ...styleExtra }}
        />
    );
};

// 🔥 UPLOAD COMO ARQUIVO (BASE64 DIRETO NO REALTIME DATABASE) — mesmo padrão já usado em
// FormasEditor.jsx/CompendioFormContext.jsx/MapaMundi.jsx. O ImageUploader antigo desta página
// dependia do Firebase Storage (uploadImagem de firebase-sync.js), que não estava funcionando; lendo
// o arquivo com FileReader e gravando o data URL direto no campo da ficha evita o Storage por
// completo e sincroniza junto com o resto da ficha via Realtime Database, como o resto do app já faz.
const ImageUploader = ({ valorAtual, onUploadComplete, placeholder, disabled = false }) => {
    const [loading, setLoading] = useState(false);
    const { callSave } = useRelicario();

    const handleUpload = (e) => {
        const file = e.target.files[0]; if (!file) return;
        setLoading(true);
        const reader = new FileReader();
        reader.onloadend = () => {
            onUploadComplete(reader.result);
            callSave();
            setLoading(false);
        };
        reader.onerror = () => { alert('Erro ao ler a imagem!'); setLoading(false); };
        reader.readAsDataURL(file);
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', border: valorAtual ? 'none' : '2px dashed currentColor', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
            {loading ? <span style={{ fontWeight: 'bold' }}>Gravando...</span> :
             valorAtual ? <img src={valorAtual} alt="Imagem" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> :
             <span style={{ opacity: 0.5, fontStyle: 'italic', padding: '20px', textAlign: 'center' }}>{disabled ? '🔒 Somente o Mestre' : placeholder}</span>}

            {!disabled && (
                <label style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: 'pointer', zIndex: 10 }}>
                    <input type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
                </label>
            )}
        </div>
    );
};

function RelicarioNavegacao() {
    const { abaAtual, setAbaAtual } = useRelicario();
    const indexAtual = CAPITULOS.findIndex(c => c.id === abaAtual);
    const total = CAPITULOS.length;
    const dadosAba = CAPITULOS[indexAtual];

    const irPara = (novoIndex) => { if (novoIndex >= 0 && novoIndex < total) setAbaAtual(CAPITULOS[novoIndex].id); };

    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px dashed currentColor', paddingBottom: '15px', marginBottom: '20px' }}>
            <button onClick={() => irPara(indexAtual - 1)} disabled={indexAtual === 0} style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: '1.2em', cursor: indexAtual === 0 ? 'default' : 'pointer', opacity: indexAtual === 0 ? 0.3 : 1, fontWeight: 'bold' }}>⮜ FOLHEAR</button>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <select value={abaAtual} onChange={(e) => setAbaAtual(e.target.value)} style={{ background: 'transparent', color: 'inherit', border: 'none', borderBottom: '1px dotted currentColor', fontSize: '0.9em', textTransform: 'uppercase', letterSpacing: '1px', outline: 'none', cursor: 'pointer', textAlign: 'center', opacity: 0.8 }}>
                    {CAPITULOS.map((c, i) => <option key={c.id} value={c.id} style={{ background: '#1e1423', color: '#e6d5b8' }}>CAPÍTULO {i + 1}: {c.label.toUpperCase()}</option>)}
                </select>
                <h2 style={{ margin: '5px 0 0 0', fontSize: '1.8em', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '10px' }}><span>{dadosAba.icon}</span> {dadosAba.label}</h2>
            </div>
            <button onClick={() => irPara(indexAtual + 1)} disabled={indexAtual === total - 1} style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: '1.2em', cursor: indexAtual === total - 1 ? 'default' : 'pointer', opacity: indexAtual === total - 1 ? 0.3 : 1, fontWeight: 'bold' }}>FOLHEAR ⮞</button>
        </div>
    );
}

// ==========================================
// 🗡️ PÁGINA 1: O ALTAR DA RELÍQUIA
// ==========================================
function PaginaAltar() {
    const { minhaFicha, updateFicha, isMestre } = useRelicario();
    const arma = minhaFicha?.armaEspiritual || {};
    const updateArma = (campo, valor) => { updateFicha(f => { if(f.armaEspiritual) f.armaEspiritual[campo] = valor; }); };
    const bloqueado = !isMestre;

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ textAlign: 'center', padding: '20px', border: '3px double currentColor', background: 'rgba(0,0,0,0.03)', borderRadius: '8px' }}>
                <CampoMagico valor={arma.nome} onChange={v => updateArma('nome', v)} placeholder="Nome da Entidade/Arma (Ex: EA - Scathach Tilith)" disabled={bloqueado} styleExtra={{ fontSize: '2.5em', fontWeight: '900', textAlign: 'center', color: '#ff003c', letterSpacing: '2px', border: 'none' }} />
                <CampoMagico valor={arma.epiteto} onChange={v => updateArma('epiteto', v)} placeholder="Epíteto (Ex: Soberania da Rainha)" disabled={bloqueado} styleExtra={{ fontSize: '1.2em', fontStyle: 'italic', textAlign: 'center', color: 'currentColor', border: 'none', opacity: 0.8 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ border: '1px dashed currentColor', padding: '15px', borderRadius: '8px', background: 'rgba(0,0,0,0.02)' }}>
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1em', opacity: 0.8 }}>📜 Cântico de Invocação</h3>
                        <AreaMagica valor={arma.cantico} onChange={v => updateArma('cantico', v)} placeholder={"Ex: I am the bone of my sword...\nUnknown to life,\nBut known for death."} disabled={bloqueado} styleExtra={{ minHeight: '180px', fontStyle: 'italic', fontSize: '1.1em', lineHeight: '1.5', border: 'none', background: 'transparent' }} />
                    </div>
                    <div style={{ border: '2px solid currentColor', padding: '15px', borderRadius: '8px', background: 'rgba(0,0,0,0.05)' }}>
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1em', color: '#ff003c' }}>💥 Dano Base da Relíquia</h3>
                        <CampoMagico valor={arma.danoBase} onChange={v => updateArma('danoBase', v)} placeholder="Ex: 250d8 + Des x2 + Energia Espiritual x2" disabled={bloqueado} styleExtra={{ fontSize: '1.3em', fontWeight: 'bold' }} />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <h3 style={{ margin: 0, fontSize: '1em', textAlign: 'center', opacity: 0.8 }}>Forma Humanoide</h3>
                        <div style={{ flex: 1, minHeight: '300px' }}><ImageUploader valorAtual={arma.avatarHumano} onUploadComplete={v => updateArma('avatarHumano', v)} placeholder="Retrato Humanoide 📸" disabled={bloqueado} /></div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <h3 style={{ margin: 0, fontSize: '1em', textAlign: 'center', opacity: 0.8 }}>Forma Espada</h3>
                        <div style={{ flex: 1, minHeight: '300px' }}><ImageUploader valorAtual={arma.avatarArma} onUploadComplete={v => updateArma('avatarArma', v)} placeholder="Retrato da Lâmina 📸" disabled={bloqueado} /></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ==========================================
// 🪨 PÁGINA 2: ESTIGMAS & RUNAS
// ==========================================
function PaginaPassivas() {
    const { minhaFicha, handleArrayItem, isMestre } = useRelicario();
    const arma = minhaFicha?.armaEspiritual || {};
    const bloqueado = !isMestre;
    return (
        <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '30px' }}>
            <div style={{ border: '1px dashed currentColor', padding: '20px', borderRadius: '8px', background: 'rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px dotted currentColor', paddingBottom: '10px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.4em', color: '#00ffcc' }}>✨ Passivas da Relíquia</h2>
                    {isMestre && <button onClick={() => handleArrayItem('passivas', 'add')} style={{ background: 'transparent', border: '1px solid currentColor', color: 'inherit', padding: '5px 10px', cursor: 'pointer' }}>+ Inscrever</button>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(arma.passivas || []).map((p, i) => (
                        <div key={p.id} style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                            <span style={{ fontSize: '1.5em', opacity: 0.5 }}>-</span>
                            <AreaMagica valor={p.texto} onChange={v => handleArrayItem('passivas', 'update', i, 'texto', v)} placeholder="Ex: EA pode absorver armas..." disabled={bloqueado} styleExtra={{ minHeight: '40px', padding: '5px' }} />
                            {isMestre && <button onClick={() => { if(window.confirm('Apagar?')) handleArrayItem('passivas', 'remove', i); }} style={{ background: 'transparent', border: 'none', color: '#ff003c', cursor: 'pointer', fontWeight: 'bold' }}>✖</button>}
                        </div>
                    ))}
                </div>
            </div>
            <div style={{ border: '1px dashed currentColor', padding: '20px', borderRadius: '8px', background: 'rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px dotted currentColor', paddingBottom: '10px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.4em', color: '#ff00ff' }}>🔮 Runas & Multiplicadores</h2>
                    {isMestre && <button onClick={() => handleArrayItem('runas', 'add')} style={{ background: 'transparent', border: '1px solid currentColor', color: 'inherit', padding: '5px 10px', cursor: 'pointer' }}>+ Inscrever</button>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(arma.runas || []).map((r, i) => (
                        <div key={r.id} style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                            <span style={{ fontSize: '1.5em', opacity: 0.5 }}>•</span>
                            <AreaMagica valor={r.texto} onChange={v => handleArrayItem('runas', 'update', i, 'texto', v)} placeholder="Ex: EA multiplica o dano em 10x..." disabled={bloqueado} styleExtra={{ minHeight: '40px', padding: '5px' }} />
                            {isMestre && <button onClick={() => { if(window.confirm('Apagar?')) handleArrayItem('runas', 'remove', i); }} style={{ background: 'transparent', border: 'none', color: '#ff003c', cursor: 'pointer', fontWeight: 'bold' }}>✖</button>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ==========================================
// 🌌 PÁGINA 3: FORMAS BASE
// ==========================================
function PaginaFormas() {
    const { minhaFicha, handleArrayItem, isMestre } = useRelicario();
    const arma = minhaFicha?.armaEspiritual || {};
    const bloqueado = !isMestre;

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid currentColor', paddingBottom: '10px' }}>
                <h2 style={{ margin: 0, fontSize: '1.8em', color: '#00aaff' }}>🌌 Formas Base da Lâmina</h2>
                {isMestre && <button onClick={() => handleArrayItem('formas', 'add')} style={{ padding: '10px 20px', background: 'transparent', border: '2px solid currentColor', color: 'inherit', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px' }}>+ CRIAR FORMA BASE</button>}
            </div>
            {(arma.formas || []).map((forma, i) => (
                <div key={forma.id} style={{ border: '2px double currentColor', padding: '20px', borderRadius: '8px', background: 'rgba(0,170,255,0.03)', position: 'relative' }}>
                    {isMestre && <button onClick={() => { if(window.confirm('Destruir Forma?')) handleArrayItem('formas', 'remove', i); }} style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', color: '#ff003c', fontSize: '1.2em', cursor: 'pointer' }}>✖</button>}
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '20px' }}>
                        <div style={{ flex: '0 0 150px', height: '200px' }}><ImageUploader valorAtual={forma.img} onUploadComplete={v => handleArrayItem('formas', 'update', i, 'img', v)} placeholder="Foto Forma 📸" disabled={bloqueado} /></div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <CampoMagico valor={forma.nome} onChange={v => handleArrayItem('formas', 'update', i, 'nome', v)} placeholder="Ex: 1ª Forma: Pecados" disabled={bloqueado} styleExtra={{ fontSize: '1.5em', fontWeight: 'bold', color: '#00aaff' }} />
                            <CampoMagico valor={forma.dano} onChange={v => handleArrayItem('formas', 'update', i, 'dano', v)} placeholder="Dano Adicional (Ex: 36d4)" disabled={bloqueado} styleExtra={{ fontSize: '1.1em', fontWeight: 'bold' }} />
                            <div style={{ marginTop: '15px', borderTop: '1px dashed currentColor', paddingTop: '15px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <h4 style={{ margin: 0, opacity: 0.8 }}>Sub-Configurações Elementais</h4>
                                    {isMestre && <button onClick={() => handleArrayItem('formas', 'add-config', i)} style={{ background: 'transparent', border: '1px solid currentColor', color: 'inherit', padding: '4px 8px', fontSize: '0.8em', cursor: 'pointer' }}>+ Sub-Configuração</button>}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    {(forma.configs || []).map((cfg, cIdx) => (
                                        <div key={cfg.id} style={{ display: 'flex', gap: '15px', background: 'rgba(0,0,0,0.05)', padding: '10px', borderRadius: '6px', position: 'relative' }}>
                                            {isMestre && <button onClick={() => { if(window.confirm('Apagar?')) handleArrayItem('formas', 'remove-config', i, null, null, cIdx); }} style={{ position: 'absolute', top: '5px', right: '5px', background: 'transparent', border: 'none', color: '#ff003c', cursor: 'pointer' }}>✖</button>}
                                            <div style={{ flex: '0 0 80px', height: '100px' }}><ImageUploader valorAtual={cfg.img} onUploadComplete={v => handleArrayItem('formas', 'update-config', i, null, v, cIdx, 'img')} placeholder="Lâmina 📸" disabled={bloqueado} /></div>
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                <CampoMagico valor={cfg.nome} onChange={v => handleArrayItem('formas', 'update-config', i, null, v, cIdx, 'nome')} placeholder="Ex: Tiamat Branca-Gelo" disabled={bloqueado} styleExtra={{ fontWeight: 'bold', fontSize: '1.1em', color: 'inherit' }} />
                                                <AreaMagica valor={cfg.desc} onChange={v => handleArrayItem('formas', 'update-config', i, null, v, cIdx, 'desc')} placeholder="Efeitos específicos..." disabled={bloqueado} styleExtra={{ minHeight: '40px', fontSize: '0.9em' }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
            {(!arma.formas || arma.formas.length === 0) && <div style={{ textAlign: 'center', opacity: 0.5, fontStyle: 'italic', padding: '40px' }}>A Lâmina ainda não despertou nenhuma Forma Base.</div>}
        </div>
    );
}

// ==========================================
// 👑 PÁGINA 4: FORMAS VERDADEIRAS
// ==========================================
function PaginaFormasVerdadeiras() {
    const { minhaFicha, handleArrayItem, isMestre } = useRelicario();
    const arma = minhaFicha?.armaEspiritual || {};
    const bloqueado = !isMestre;

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #ffcc00', paddingBottom: '10px' }}>
                <h2 style={{ margin: 0, fontSize: '1.8em', color: '#ffcc00' }}>👑 Formas Verdadeiras (O Ápice)</h2>
                {isMestre && <button onClick={() => handleArrayItem('formasVerdadeiras', 'add')} style={{ padding: '10px 20px', background: 'transparent', border: '2px solid #ffcc00', color: '#ffcc00', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px' }}>+ DESPERTAR FORMA VERDADEIRA</button>}
            </div>
            {(arma.formasVerdadeiras || []).map((forma, i) => (
                <div key={forma.id} style={{ border: '2px double #ffcc00', padding: '20px', borderRadius: '8px', background: 'rgba(255,204,0,0.05)', position: 'relative' }}>
                    {isMestre && <button onClick={() => { if(window.confirm('Destruir Forma Verdadeira?')) handleArrayItem('formasVerdadeiras', 'remove', i); }} style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', color: '#ff003c', fontSize: '1.2em', cursor: 'pointer' }}>✖</button>}
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '20px' }}>
                        <div style={{ flex: '0 0 150px', height: '200px' }}><ImageUploader valorAtual={forma.img} onUploadComplete={v => handleArrayItem('formasVerdadeiras', 'update', i, 'img', v)} placeholder="Foto Forma 📸" disabled={bloqueado} /></div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <CampoMagico valor={forma.nome} onChange={v => handleArrayItem('formasVerdadeiras', 'update', i, 'nome', v)} placeholder="Ex: 1 Forma Verdadeira: Pecados" disabled={bloqueado} styleExtra={{ fontSize: '1.5em', fontWeight: 'bold', color: '#ff003c' }} />
                            <CampoMagico valor={forma.dano} onChange={v => handleArrayItem('formasVerdadeiras', 'update', i, 'dano', v)} placeholder="Dano Colossal (Ex: 120d4 + Des + E.E)" disabled={bloqueado} styleExtra={{ fontSize: '1.1em', fontWeight: 'bold', color: '#ffcc00' }} />
                            <div style={{ marginTop: '15px', borderTop: '1px dashed #ffcc00', paddingTop: '15px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <h4 style={{ margin: 0, opacity: 0.9, color: '#ffcc00' }}>Sub-Configurações Supremas</h4>
                                    {isMestre && <button onClick={() => handleArrayItem('formasVerdadeiras', 'add-config', i)} style={{ background: 'transparent', border: '1px solid #ffcc00', color: '#ffcc00', padding: '4px 8px', fontSize: '0.8em', cursor: 'pointer' }}>+ Sub-Configuração</button>}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    {(forma.configs || []).map((cfg, cIdx) => (
                                        <div key={cfg.id} style={{ display: 'flex', gap: '15px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px', position: 'relative', border: '1px solid #ffcc0040' }}>
                                            {isMestre && <button onClick={() => { if(window.confirm('Apagar?')) handleArrayItem('formasVerdadeiras', 'remove-config', i, null, null, cIdx); }} style={{ position: 'absolute', top: '5px', right: '5px', background: 'transparent', border: 'none', color: '#ff003c', cursor: 'pointer' }}>✖</button>}
                                            <div style={{ flex: '0 0 80px', height: '100px' }}><ImageUploader valorAtual={cfg.img} onUploadComplete={v => handleArrayItem('formasVerdadeiras', 'update-config', i, null, v, cIdx, 'img')} placeholder="Lâmina 📸" disabled={bloqueado} /></div>
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                <CampoMagico valor={cfg.nome} onChange={v => handleArrayItem('formasVerdadeiras', 'update-config', i, null, v, cIdx, 'nome')} placeholder="Ex: Variante Verdadeira" disabled={bloqueado} styleExtra={{ fontWeight: 'bold', fontSize: '1.1em', color: '#ffcc00' }} />
                                                <AreaMagica valor={cfg.desc} onChange={v => handleArrayItem('formasVerdadeiras', 'update-config', i, null, v, cIdx, 'desc')} placeholder="Efeitos específicos..." disabled={bloqueado} styleExtra={{ minHeight: '40px', fontSize: '0.9em' }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
            {(!arma.formasVerdadeiras || arma.formasVerdadeiras.length === 0) && <div style={{ textAlign: 'center', opacity: 0.5, fontStyle: 'italic', padding: '40px' }}>Nenhuma Forma Verdadeira foi revelada ainda.</div>}
        </div>
    );
}

// ==========================================
// ⚔️ PÁGINA 5: ARSENAL MÍSTICO
// ==========================================
function PaginaArsenal() {
    const { minhaFicha, updateItemById, removeItemById, toggleEquiparById, addItem } = useRelicario();
    const inventario = minhaFicha?.inventario || [];
    
    const arsenal = inventario.filter(i => ['arma', 'armadura', 'acessorio'].includes(i.tipo));

    return (
        <div className="fade-in" style={{ border: '2px solid currentColor', padding: '20px', borderRadius: '8px', background: 'rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px dotted currentColor', paddingBottom: '10px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5em' }}>⚔️ Arsenal Místico & Relíquias</h2>
                    <span style={{ fontSize: '0.85em', opacity: 0.7, fontStyle: 'italic' }}>Armas equipadas aqui podem ser vinculadas a Habilidades na Página 1.</span>
                </div>
                <button onClick={() => addItem('arma')} style={{ padding: '8px 15px', background: 'transparent', border: '1px solid currentColor', color: 'inherit', fontWeight: 'bold', cursor: 'pointer' }}>+ Guardar Nova Arma</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {arsenal.map(item => {
                    const rData = RARIDADES[item.raridade] || RARIDADES['comum'];
                    return (
                        <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: item.equipado ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.03)', padding: '15px', borderRadius: '6px', borderLeft: `4px solid ${rData.cor}`, border: item.equipado ? `2px solid ${rData.cor}` : `1px dashed ${rData.cor}80` }}>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <CampoMagico valor={item.nome} onChange={v => updateItemById(item.id, 'nome', v)} placeholder="Nome do Item" styleExtra={{ flex: '1 1 200px', fontWeight: 'bold', fontSize: '1.2em', color: rData.cor }} />
                                
                                <select value={item.tipo || 'arma'} onChange={e => updateItemById(item.id, 'tipo', e.target.value)} style={{ background: 'transparent', color: 'inherit', border: 'none', borderBottom: '1px dotted currentColor', outline: 'none', fontFamily: 'inherit' }}>
                                    {TIPOS_ARSENAL.map(opt => <option key={opt.value} value={opt.value} style={{color: '#000'}}>{opt.label}</option>)}
                                </select>

                                <select value={item.raridade || 'comum'} onChange={e => updateItemById(item.id, 'raridade', e.target.value)} style={{ background: 'transparent', color: rData.cor, border: 'none', borderBottom: '1px dotted currentColor', outline: 'none', fontWeight: 'bold', fontFamily: 'inherit' }}>
                                    {Object.entries(RARIDADES).map(([k, v]) => <option key={k} value={k} style={{color: '#000'}}>{v.label}</option>)}
                                </select>
                                
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ fontSize: '0.8em', opacity: 0.7 }}>Qtd:</span><CampoMagico valor={item.quantidade} onChange={v => updateItemById(item.id, 'quantidade', Number(v))} type="number" styleExtra={{ width: '50px', textAlign: 'center' }} /></div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ fontSize: '0.8em', opacity: 0.7 }}>Kg:</span><CampoMagico valor={item.peso} onChange={v => updateItemById(item.id, 'peso', Number(v))} type="number" step="0.1" styleExtra={{ width: '50px', textAlign: 'center' }} /></div>
                                <button onClick={() => removeItemById(item.id)} style={{ background: 'transparent', border: 'none', color: '#ff003c', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.2em' }}>✖</button>
                            </div>

                            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', borderTop: '1px dashed currentColor', paddingTop: '10px', marginTop: '5px' }}>
                                {item.tipo === 'arma' && (
                                    <>
                                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <span style={{ fontSize: '0.8em', opacity: 0.7, fontWeight: 'bold' }}>Dano:</span>
                                            <CampoMagico valor={item.dano} onChange={v => updateItemById(item.id, 'dano', v)} placeholder="Ex: 2d8+5" styleExtra={{ flex: 1 }} />
                                        </div>
                                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <span style={{ fontSize: '0.8em', opacity: 0.7, fontWeight: 'bold' }}>Tipo:</span>
                                            <select value={item.tipoDano || 'Cortante'} onChange={e => updateItemById(item.id, 'tipoDano', e.target.value)} style={{ background: 'transparent', color: 'inherit', border: 'none', borderBottom: '1px dashed currentColor', outline: 'none', fontFamily: 'inherit', flex: 1 }}>
                                                {TIPOS_DANO.map(d => <option key={d} value={d} style={{color: '#000'}}>{d}</option>)}
                                            </select>
                                        </div>
                                    </>
                                )}
                                <button onClick={() => toggleEquiparById(item.id)} style={{ padding: '5px 15px', background: item.equipado ? rData.cor : 'transparent', color: item.equipado ? '#000' : 'inherit', border: `1px solid ${rData.cor}`, borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', marginLeft: 'auto' }}>
                                    {item.equipado ? '★ EQUIPADO' : 'Equipar'}
                                </button>
                            </div>
                            
                            <AreaMagica valor={item.desc} onChange={v => updateItemById(item.id, 'desc', v)} placeholder="Descrição e bônus da arma/armadura..." styleExtra={{ minHeight: '30px', fontSize: '0.85em', marginTop: '5px' }} />
                        </div>
                    );
                })}
                {arsenal.length === 0 && <div style={{ textAlign: 'center', opacity: 0.5, fontStyle: 'italic', padding: '20px' }}>O seu arsenal está vazio.</div>}
            </div>
        </div>
    );
}

// ==========================================
// 🧪 PÁGINA 6: SUPRIMENTOS E NOTAS
// ==========================================
function PaginaSuprimentos() {
    const { minhaFicha, updateItemById, removeItemById, addItem, handleArrayItem } = useRelicario();
    const inventario = minhaFicha?.inventario || [];
    
    const suprimentos = inventario.filter(i => ['consumivel', 'mundano'].includes(i.tipo));

    // 🔥 BLINDAGEM DO NOTAS PARA EVITAR CRASH 🔥
    const notasArray = Array.isArray(minhaFicha?.notas) ? minhaFicha.notas : [];

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            {/* INVENTÁRIO COMUM */}
            <div style={{ border: '2px solid currentColor', padding: '20px', borderRadius: '8px', background: 'rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px dotted currentColor', paddingBottom: '10px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.5em' }}>🧪 Mochila & Suprimentos</h2>
                    <button onClick={() => addItem('consumivel')} style={{ padding: '8px 15px', background: 'transparent', border: '1px solid currentColor', color: 'inherit', fontWeight: 'bold', cursor: 'pointer' }}>+ Novo Suprimento</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {suprimentos.map(item => {
                        const rData = RARIDADES[item.raridade] || RARIDADES['comum'];
                        return (
                            <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(0,0,0,0.03)', padding: '10px 15px', borderRadius: '6px', borderLeft: `4px solid ${rData.cor}` }}>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <CampoMagico valor={item.nome} onChange={v => updateItemById(item.id, 'nome', v)} placeholder="Nome da Poção/Item" styleExtra={{ flex: '1 1 200px', fontWeight: 'bold', fontSize: '1.1em', color: rData.cor }} />
                                    
                                    <select value={item.tipo || 'consumivel'} onChange={e => updateItemById(item.id, 'tipo', e.target.value)} style={{ background: 'transparent', color: 'inherit', border: 'none', borderBottom: '1px dotted currentColor', outline: 'none', fontFamily: 'inherit' }}>
                                        {TIPOS_SUPRIMENTO.map(opt => <option key={opt.value} value={opt.value} style={{color: '#000'}}>{opt.label}</option>)}
                                    </select>

                                    <select value={item.raridade || 'comum'} onChange={e => updateItemById(item.id, 'raridade', e.target.value)} style={{ background: 'transparent', color: rData.cor, border: 'none', borderBottom: '1px dotted currentColor', outline: 'none', fontWeight: 'bold', fontFamily: 'inherit' }}>
                                        {Object.entries(RARIDADES).map(([k, v]) => <option key={k} value={k} style={{color: '#000'}}>{v.label}</option>)}
                                    </select>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ fontSize: '0.8em', opacity: 0.7 }}>Qtd:</span><CampoMagico valor={item.quantidade} onChange={v => updateItemById(item.id, 'quantidade', Number(v))} type="number" styleExtra={{ width: '40px', textAlign: 'center' }} /></div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ fontSize: '0.8em', opacity: 0.7 }}>Kg:</span><CampoMagico valor={item.peso} onChange={v => updateItemById(item.id, 'peso', Number(v))} type="number" step="0.1" styleExtra={{ width: '40px', textAlign: 'center' }} /></div>
                                    <button onClick={() => removeItemById(item.id)} style={{ background: 'transparent', border: 'none', color: '#ff003c', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.2em' }}>✖</button>
                                </div>
                                <AreaMagica valor={item.desc} onChange={v => updateItemById(item.id, 'desc', v)} placeholder="Efeito da poção ou utilidade..." styleExtra={{ minHeight: '30px', fontSize: '0.85em' }} />
                            </div>
                        );
                    })}
                    {suprimentos.length === 0 && <div style={{ textAlign: 'center', opacity: 0.5, fontStyle: 'italic', padding: '10px' }}>Sem poções ou suprimentos.</div>}
                </div>
            </div>

            {/* BLOCO DE NOTAS DA CAMPANHA */}
            <div style={{ border: '2px solid currentColor', padding: '20px', borderRadius: '8px', background: 'rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px dotted currentColor', paddingBottom: '10px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.5em' }}>📝 Diário de Bordo & Anotações</h2>
                    <button onClick={() => handleArrayItem('notas', 'add')} style={{ padding: '8px 15px', background: 'transparent', border: '1px solid currentColor', color: 'inherit', fontWeight: 'bold', cursor: 'pointer' }}>+ Nova Folha</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                    {notasArray.map((nota, i) => (
                        <div key={nota.id} style={{ position: 'relative', background: 'rgba(0,0,0,0.05)', padding: '15px', borderRadius: '6px', borderTop: '3px solid currentColor', boxShadow: '2px 2px 10px rgba(0,0,0,0.1)' }}>
                            <button onClick={() => { if(window.confirm('Queimar folha?')) handleArrayItem('notas', 'remove', i); }} style={{ position: 'absolute', top: '5px', right: '5px', background: 'transparent', border: 'none', color: '#ff003c', cursor: 'pointer', fontWeight: 'bold' }}>✖</button>
                            <CampoMagico valor={nota.titulo} onChange={v => handleArrayItem('notas', 'update', i, 'titulo', v)} placeholder="Título da Nota (Ex: Pista do Dragão)" styleExtra={{ fontWeight: 'bold', fontSize: '1.1em', marginBottom: '10px', paddingRight: '20px' }} />
                            <AreaMagica valor={nota.texto} onChange={v => handleArrayItem('notas', 'update', i, 'texto', v)} placeholder="Escreva as suas descobertas, nomes de NPCs, charadas..." styleExtra={{ minHeight: '120px', fontSize: '0.9em', fontStyle: 'italic', background: 'transparent', border: 'none' }} />
                        </div>
                    ))}
                    {notasArray.length === 0 && <div style={{ textAlign: 'center', opacity: 0.5, fontStyle: 'italic', padding: '20px', gridColumn: '1 / -1' }}>Nenhuma anotação gravada neste diário.</div>}
                </div>
            </div>

        </div>
    );
}

// ==========================================
// 🚀 O RENDERIZADOR PRINCIPAL DO LIVRO
// ==========================================
export default function RelicarioPanel() {
    return (
        <RelicarioProvider>
            <div className="grimorio-estilo-papel" style={{ width: '100%', paddingBottom: '30px' }}>
                <RelicarioNavegacao />
                <ConteudoDinamico />
            </div>
        </RelicarioProvider>
    );
}

// 📖 Aviso fixo nos Capítulos 1-4: deixa claro o escopo (só Arma Espiritual/Fantasma Nobre, não
// armas comuns) e, pra quem não é Mestre/Co-Mestre, que esta seção é somente consulta.
function AvisoArmaEspiritual({ isMestre }) {
    return (
        <div style={{ marginBottom: '20px', padding: '10px 15px', border: '1px dashed currentColor', borderRadius: '6px', background: 'rgba(0,0,0,0.03)', fontSize: '0.85em', opacity: 0.85, textAlign: 'center', lineHeight: '1.6' }}>
            📖 Exclusivo da <strong>Arma Espiritual / Fantasma Nobre</strong> desta entidade — armas comuns vão no <strong>Arsenal Místico</strong> (Capítulo 5).
            {!isMestre && <><br />🔒 Somente o Mestre e Co-Mestres podem editar esta seção; jogadores podem apenas consultar.</>}
        </div>
    );
}

function ConteudoDinamico() {
    const { abaAtual, isMestre } = useRelicario();

    let pagina = null;
    if (abaAtual === 'altar') pagina = <PaginaAltar />;
    else if (abaAtual === 'passivas') pagina = <PaginaPassivas />;
    else if (abaAtual === 'formas') pagina = <PaginaFormas />;
    else if (abaAtual === 'verdadeiras') pagina = <PaginaFormasVerdadeiras />;
    else if (abaAtual === 'arsenal') pagina = <PaginaArsenal />;
    else if (abaAtual === 'suprimentos') pagina = <PaginaSuprimentos />;
    else return null;

    return (
        <>
            {CAPITULOS_ARMA_ESPIRITUAL.includes(abaAtual) && <AvisoArmaEspiritual isMestre={isMestre} />}
            {pagina}
        </>
    );
}