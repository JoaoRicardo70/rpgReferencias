import React, { useState, useEffect } from 'react';
import { uploadImagem } from '../../services/firebase-sync';
import { getMaximo, getMaximoSemFormas, getRawBase, getBuffs } from '../../core/attributes';
import { getRank } from '../../core/prestige';

// ==========================================
// 🛡️ DADOS DO COMPÊNDIO (PARA O ÍCONE DA MOLDURA)
// ==========================================
const CLASSES_REGULARES_BASE = [
    { id: 'saber', nome: 'Saber', icone: '⚔️', cor: '#0088ff' },
    { id: 'archer', nome: 'Archer', icone: '🏹', cor: '#ff003c' },
    { id: 'lancer', nome: 'Lancer', icone: '🗡️', cor: '#00ffcc' },
    { id: 'rider', nome: 'Rider', icone: '🏇', cor: '#ff8800' },
    { id: 'caster', nome: 'Caster', icone: '🧙‍♂️', cor: '#cc00ff' },
    { id: 'assassin', nome: 'Assassin', icone: '🔪', cor: '#444444' },
    { id: 'berserker', nome: 'Berserker', icone: '狂', cor: '#ff0000' }
];

const CLASSES_EXTRA_BASE = [
    { id: 'shielder', nome: 'Shielder', icone: '🛡️', cor: '#00ffff' },
    { id: 'ruler', nome: 'Ruler', icone: '⚖️', cor: '#ffcc00' },
    { id: 'avenger', nome: 'Avenger', icone: '⛓️', cor: '#880000' },
    { id: 'alterego', nome: 'Alter Ego', icone: '🎭', cor: '#ff00ff' },
    { id: 'foreigner', nome: 'Foreigner', icone: '🐙', cor: '#00ff88' },
    { id: 'mooncancer', nome: 'Moon Cancer', icone: '🌕', cor: '#8888aa' },
    { id: 'pretender', nome: 'Pretender', icone: '🤥', cor: '#ffaa00' },
    { id: 'beast', nome: 'Beast', icone: '👹', cor: '#4a0000' },
    { id: 'savior', nome: 'Savior', icone: '☀️', cor: '#ffffff' },
    { id: 'desconhecido', nome: '?', icone: '👤', cor: '#666666' }
];

const getClasseInfo = (ficha) => {
    const nomeClasse = ficha?.bio?.classe;
    if (!nomeClasse) return null;
    
    // 🔥 Inteligência extra: Ignora espaços, hífens e maiúsculas para nunca falhar o Match!
    const normalizar = (txt) => String(txt).replace(/[^a-z0-9]/gi, '').toLowerCase();
    const nomeStr = normalizar(nomeClasse);
    
    const todasClasses = [...CLASSES_REGULARES_BASE, ...CLASSES_EXTRA_BASE];
    const overrides = ficha?.compendioOverrides?.classes || {};
    
    const overrideMatch = Object.values(overrides).find(c => !c.deletado && c.nome && normalizar(c.nome) === nomeStr);
    if (overrideMatch) return overrideMatch;
    
    return todasClasses.find(c => normalizar(c.nome) === nomeStr) || null;
};

// ==========================================
// 🛡️ FUNÇÕES SEGURAS DA ENGINE E MATEMÁTICA
// ==========================================
const safeGetRawBase = (f, k) => typeof getRawBase === 'function' ? getRawBase(f, k) : parseFloat(f[k]?.base) || 0;
const safeGetRank = (prest, asc) => typeof getRank === 'function' ? getRank(prest, asc) : { l: 'F', c: '#ffffff', a: asc };
const safeGetBuffs = (f, k, t) => typeof getBuffs === 'function' ? getBuffs(f, k, t) : {};

const getBasePFor = (ficha, k) => {
    const mults = { vida: 1000000, mana: 10000000, aura: 10000000, chakra: 10000000, corpo: 10000000, status: 1000 };
    const div = parseFloat(ficha?.divisores?.[k]) || 1;
    if (k === 'status') {
        let m = 0;
        ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'].forEach(s => {
            m += safeGetRawBase(ficha, s);
        });
        return Math.floor(((m / 8) / mults.status) * div) || 0;
    }
    return Math.floor((safeGetRawBase(ficha, k) / (mults[k] || 1)) * div) || 0;
};

const getEfetivoMFormas = (ficha, k) => {
    const anchor = k === 'status' ? 'forca' : k;
    let s = ficha[anchor] || {};
    let b = safeGetBuffs(ficha, anchor, true);
    let v = parseFloat(s.mFormas) || 1.0;
    if (!b._hasBuff || !b._hasBuff.mformas) return v;
    return (v === 1.0 ? 0 : v) + b.mformas;
};

const calcularPrestAtual = (ficha, attrKey, baseP) => {
    const mFormas = getEfetivoMFormas(ficha, attrKey);
    const multForma = mFormas >= 10 ? (mFormas / 10) : (mFormas > 1 ? mFormas : 1);
    return Math.floor((baseP || 0) * multForma) || 0;
};

// ==========================================
// 🖋️ INPUTS E BARRAS MÁGICAS (ESTILO PAPEL)
// ==========================================
const CampoMagicoNPC = ({ valor, onChange, placeholder, styleExtra = {}, type = "text", isNumber = false }) => {
    const [focused, setFocused] = useState(false);

    const handleChange = (e) => {
        let val = e.target.value;
        if (isNumber && val !== '') { 
            val = val.replace(',', '.');
            let num = Number(val); 
            if (!isNaN(num)) val = num; 
            else val = 0; 
        }
        onChange(val);
    };

    let displayValue = valor !== undefined && valor !== null ? String(valor) : '';
    let currentType = type;

    if (isNumber && !focused && displayValue !== '') {
        let num = Number(displayValue);
        if (!isNaN(num)) displayValue = num.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
        currentType = 'text';
    } else if (isNumber && focused) {
        currentType = 'number';
    }

    return (
        <input 
            type={currentType} 
            step={isNumber ? "any" : undefined}
            value={displayValue} 
            onChange={handleChange} 
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            style={{ background: 'transparent', border: 'none', borderBottom: '1px dashed currentColor', fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit', fontWeight: 'inherit', fontStyle: 'inherit', outline: 'none', padding: '0 5px', width: '100px', ...styleExtra }} 
        />
    );
};

const AreaMagicaNPC = ({ valor, onChange, placeholder, styleExtra = {} }) => (
    <textarea 
        value={valor || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', minHeight: '60px', background: 'transparent', border: 'none', borderBottom: '2px dotted inherit', color: 'inherit', fontFamily: 'inherit', padding: '8px', outline: 'none', resize: 'vertical', ...styleExtra }}
    />
);

const LabelMagicoNPC = ({ valor, onChange, fallback }) => (
    <input 
        type="text" value={valor !== undefined ? valor : fallback} onChange={(e) => onChange(e.target.value)} 
        size={Math.max(String(valor !== undefined ? valor : fallback).length, 3)}
        style={{ background: 'transparent', border: 'none', borderBottom: '1px solid transparent', fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit', fontWeight: 'bold', fontStyle: 'italic', outline: 'none', padding: '0', cursor: 'text', transition: '0.2s' }}
        onFocus={(e) => e.target.style.borderBottom = '1px dashed currentColor'} onBlur={(e) => e.target.style.borderBottom = '1px solid transparent'}
    />
);

// rawMaxParaEscala decide SÓ a escala de notação (pVit) — chamadores que precisam ignorar Formas
// na decisão passam o máximo ESTÁVEL (getMaximoSemFormas) aqui, mantendo rawMax (completo, com
// Formas) como numerador de mxDisplay (ver core/vitals.js > calcVitalScale).
const calcularEscala = (rawMax, key, rawMaxParaEscala = rawMax) => {
    if (!rawMax || isNaN(rawMax) || rawMax <= 0) return { mxDisplay: 0, pVit: 0 };
    const limit = (key === 'vida' || key === 'pv' || key === 'pm') ? 8 : 9;
    const baseEscala = (rawMaxParaEscala && !isNaN(rawMaxParaEscala) && rawMaxParaEscala > 0) ? rawMaxParaEscala : rawMax;
    const strVal = String(Math.floor(baseEscala));
    const pVit = Math.max(0, strVal.length - limit);
    const mxDisplay = pVit > 0 ? Math.floor(rawMax / Math.pow(10, pVit)) : Math.floor(rawMax);
    return { mxDisplay: isNaN(mxDisplay) ? 0 : mxDisplay, pVit: isNaN(pVit) ? 0 : pVit };
};

const BarraVitalNPC = ({ atual, maximo, pVit, cor, corTexto = "#fff", onChangeAtual }) => {
    const pct = maximo > 0 ? Math.min(100, Math.max(0, (atual / maximo) * 100)) : 0;
    const isDark = corTexto === '#fff';
    return (
        <div style={{ position: 'relative', width: '100%', height: '35px', border: '2px solid currentColor', borderRadius: '6px', background: 'rgba(255,255,255,0.2)', overflow: 'hidden', marginTop: '5px', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)', display: 'flex' }}>
            {pVit > 0 && (
                <div style={{ width: '35px', height: '100%', background: 'rgba(0,0,0,0.9)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2em', borderRight: '2px solid rgba(0,0,0,0.8)', zIndex: 5, boxShadow: `inset 0 0 10px ${cor}` }}>{pVit}</div>
            )}
            <div style={{ flex: 1, position: 'relative' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: cor, transition: 'width 0.3s ease' }} />
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2em', color: corTexto, textShadow: isDark ? '1px 1px 3px #000, -1px -1px 3px #000' : 'none' }}>
                    <CampoMagicoNPC valor={atual} onChange={onChangeAtual} isNumber={true} styleExtra={{ width: '120px', textAlign: 'right', color: corTexto, textShadow: 'inherit', borderBottom: `1px dashed ${isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'}` }} />
                    <span style={{ margin: '0 8px' }}>/</span><span>{Number(maximo).toLocaleString('pt-BR')}</span>
                </div>
            </div>
        </div>
    );
};

const RadarDesenhadoNPC = ({ ficha, isAtual, corTinta = "#000000" }) => {
    const eixos = [
        { label: 'VIDA', key: 'vida' }, { label: 'MANA', key: 'mana' }, { label: 'AURA', key: 'aura' },
        { label: 'CHAKRA', key: 'chakra' }, { label: 'CORPO', key: 'corpo' }, { label: 'STATUS', key: 'status' }
    ];
    const angulos = Array.from({length: 6}).map((_, i) => Math.PI * 2 * i / 6 - Math.PI / 2);
    const ascensao = parseInt(ficha?.ascensaoBase) || 1;
    const rankInfos = [];

    const dataPoints = eixos.map((e, i) => {
        const baseP = getBasePFor(ficha, e.key);
        const pAtual = isAtual ? calcularPrestAtual(ficha, e.key, baseP) : baseP;
        const rank = safeGetRank(pAtual, ascensao);
        rankInfos.push(rank);

        let valNorm = pAtual || 0;
        if (valNorm >= 100) { valNorm = valNorm % 100; if (valNorm === 0 && pAtual > 0) valNorm = 100; }
        const frac = Math.min(Math.max(valNorm / 100, 0.05), 1);
        return `${100 + 75 * frac * Math.cos(angulos[i])},${100 + 75 * frac * Math.sin(angulos[i])}`;
    }).join(' ');

    const hexToRgba = (hex, alpha) => {
        const r = parseInt(hex.slice(1, 3), 16) || 0;
        const g = parseInt(hex.slice(3, 5), 16) || 0;
        const b = parseInt(hex.slice(5, 7), 16) || 0;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    return (
        <svg viewBox="0 0 240 240" style={{ width: '100%', maxWidth: '340px', height: 'auto', overflow: 'visible', dropShadow: '2px 2px 2px rgba(0,0,0,0.2)' }}>
            <g transform="translate(20, 20)">
                {[0.33, 0.66, 1.0].map((scale, i) => <polygon key={i} fill="none" stroke={hexToRgba(corTinta, 0.2)} strokeWidth="1" strokeDasharray="3" points={angulos.map(a => `${100 + 75 * scale * Math.cos(a)},${100 + 75 * scale * Math.sin(a)}`).join(' ')} />)}
                {angulos.map((a, i) => <line key={i} x1="100" y1="100" x2={100 + 75 * Math.cos(a)} y2={100 + 75 * Math.sin(a)} stroke={hexToRgba(corTinta, 0.2)} strokeWidth="1" strokeDasharray="3" />)}
                <polygon points={dataPoints} fill={hexToRgba(corTinta, isAtual ? 0.3 : 0.1)} stroke={corTinta} strokeWidth="2" strokeLinejoin="round" style={{ transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                {eixos.map((e, i) => {
                    const rk = rankInfos[i];
                    return (
                        <text key={i} x={100 + 105 * Math.cos(angulos[i])} y={100 + 105 * Math.sin(angulos[i])} textAnchor="middle" dominantBaseline="central" fill={rk.c} fontSize="11" fontWeight="bold" style={{ textShadow: `0 0 5px ${rk.c}`, fontStyle: 'italic', transition: 'fill 0.3s' }}>
                            [{rk.l}] A{rk.a} {e.label}
                        </text>
                    );
                })}
            </g>
        </svg>
    );
};

// ==========================================
// 📖 O GRIMÓRIO DO NPC (Exportado para o Mestre)
// ==========================================
export default function DiarioNPC({ npcData, onSaveNpc }) {
    const [uploadingImg, setUploadingImg] = useState(false);
    const [modalEstilo, setModalEstilo] = useState(false);
    const [paginaAtual, setPaginaAtual] = useState(1);
    
    const [animDirection, setAnimDirection] = useState('next');

    const [localCorFundo, setLocalCorFundo] = useState('#ffe6cc');
    const [localCorTexto, setLocalCorTexto] = useState('#000000');
    const [localCorTinta, setLocalCorTinta] = useState('#000000');
    const [localBgImg, setLocalBgImg] = useState('');
    const [localMolduraAvatar, setLocalMolduraAvatar] = useState('');
    const [localCorMoldura, setLocalCorMoldura] = useState('#ffffff');
    const [localIconeClasse, setLocalIconeClasse] = useState('');
    const [localModoMoldura, setLocalModoMoldura] = useState('screen');
    const [localModoFundo, setLocalModoFundo] = useState('normal');
    const [localCorFundoTint, setLocalCorFundoTint] = useState('#ffffff');

    useEffect(() => {
        if (npcData) {
            setLocalCorFundo(npcData.estetica?.diarioCor || '#ffe6cc');
            setLocalCorTexto(npcData.estetica?.corTexto || '#000000');
            setLocalCorTinta(npcData.estetica?.corTintaRadar || '#000000');
            setLocalBgImg(npcData.estetica?.bgImg || '');
            setLocalMolduraAvatar(npcData.estetica?.molduraAvatar || '');
            setLocalCorMoldura(npcData.estetica?.corMoldura || '#ffffff');
            setLocalIconeClasse(npcData.estetica?.iconeClasse || '');
            setLocalModoMoldura(npcData.estetica?.modoMoldura || 'screen');
            setLocalModoFundo(npcData.estetica?.modoFundo || 'normal');
            setLocalCorFundoTint(npcData.estetica?.corFundoTint || '#ffffff');
        }
    }, [npcData?.estetica]);

    if (!npcData) return <div style={{ color: '#fff', padding: 20 }}>Conectando à Entidade...</div>;

    const classeInfo = getClasseInfo(npcData);
    const iconeFinal = localIconeClasse || classeInfo?.iconeUrl;

    const mudarPagina = (nova) => {
        setAnimDirection(nova > paginaAtual ? 'next' : 'prev');
        setPaginaAtual(nova);
    };

    const salvar = (caminho, valor) => {
        const valFinal = (valor === undefined || (isNaN(valor) && typeof valor === 'number')) ? null : valor;
        const novoNpc = JSON.parse(JSON.stringify(npcData)); 
        const chaves = caminho.split('.');
        let atual = novoNpc;
        for (let i = 0; i < chaves.length - 1; i++) {
            if (typeof atual[chaves[i]] !== 'object' || atual[chaves[i]] === null) atual[chaves[i]] = {};
            atual = atual[chaves[i]];
        }
        atual[chaves[chaves.length - 1]] = valFinal;
        onSaveNpc(novoNpc);
    };

    const handleStyleChange = (key, val) => {
        if (key === 'diarioCor') setLocalCorFundo(val);
        else if (key === 'corTexto') setLocalCorTexto(val);
        else if (key === 'corTintaRadar') setLocalCorTinta(val);
        else if (key === 'bgImg') setLocalBgImg(val);
        else if (key === 'molduraAvatar') setLocalMolduraAvatar(val);
        else if (key === 'corMoldura') setLocalCorMoldura(val);
        else if (key === 'iconeClasse') setLocalIconeClasse(val);
        else if (key === 'modoMoldura') setLocalModoMoldura(val);
        else if (key === 'modoFundo') setLocalModoFundo(val);
        else if (key === 'corFundoTint') setLocalCorFundoTint(val);

        if (window.timerSaveCorNPC) clearTimeout(window.timerSaveCorNPC);
        window.timerSaveCorNPC = setTimeout(() => {
            const novoNpc = JSON.parse(JSON.stringify(npcData));
            if (!novoNpc.estetica) novoNpc.estetica = {};
            novoNpc.estetica[key] = val;
            onSaveNpc(novoNpc);
        }, 800);
    };

    const handleBgUpload = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try {
            const url = await uploadImagem(file, `backgrounds_npcs/${npcData.id || 'desconhecido'}_bg`);
            handleStyleChange('bgImg', url);
        } catch (err) { alert('Erro ao enviar a imagem de fundo!'); }
    };

    const handleMolduraUpload = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try {
            const url = await uploadImagem(file, `molduras_avatars_npcs/${npcData.id || 'desconhecido'}_moldura`);
            handleStyleChange('molduraAvatar', url);
        } catch (err) { alert('Erro ao enviar a moldura!'); }
    };

    const handleIconeUpload = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try {
            const url = await uploadImagem(file, `icones_classes_npcs/${npcData.id || 'desconhecido'}_icone`);
            handleStyleChange('iconeClasse', url);
        } catch (err) { alert('Erro ao enviar o ícone!'); }
    };

    const handleTabelaChange = (k, tipo, valor) => {
        let numVal = Number(valor);
        if (isNaN(numVal)) numVal = 0;

        const divAtual = parseFloat(npcData.divisores?.[k]) || 1;
        const prestAtual = getBasePFor(npcData, k);

        let novoP = tipo === 'prestigio' ? numVal : prestAtual;
        let novoDiv = tipo === 'divisor' ? (numVal > 0 ? numVal : 1) : divAtual;
        
        const mults = { vida: 1000000, mana: 10000000, aura: 10000000, chakra: 10000000, corpo: 10000000, status: 1000 };
        const mult = mults[k] || 1;
        
        const novaBase = Math.floor((novoP / novoDiv) * mult);
        const novoNpc = JSON.parse(JSON.stringify(npcData));
        
        if (novoNpc.overridePrestigio) novoNpc.overridePrestigio = null;

        if (tipo === 'divisor') {
            if (!novoNpc.divisores) novoNpc.divisores = {};
            novoNpc.divisores[k] = novoDiv;
        }
        if (tipo === 'prestigio') {
            if (k === 'status') {
                ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'].forEach(s => {
                    if (!novoNpc[s]) novoNpc[s] = {};
                    novoNpc[s].base = novaBase;
                });
            } else {
                if (!novoNpc[k]) novoNpc[k] = {};
                novoNpc[k].base = novaBase;
            }
        }
        onSaveNpc(novoNpc);
    };

    const handleArrayItem = (chave, acao, index, campo, valor) => {
        const novoNpc = JSON.parse(JSON.stringify(npcData));
        if (!novoNpc[chave]) novoNpc[chave] = [];
        if (acao === 'add') novoNpc[chave].push({ nome: '', custo: '', dano: '', descricao: '' });
        else if (acao === 'remove') novoNpc[chave].splice(index, 1);
        else if (acao === 'update') novoNpc[chave][index][campo] = valor;
        onSaveNpc(novoNpc);
    };

    const getLabel = (key, fallback) => npcData.labels?.[key] !== undefined ? npcData.labels[key] : fallback;
    const setLabel = (key, val) => salvar(`labels.${key}`, val);
    const fonteDiario = npcData.estetica?.diarioFonte || '"Comic Sans MS", "Chalkboard SE", "Marker Felt", cursive';

    const getSupremas = () => {
        const pVida = getBasePFor(npcData, 'vida');
        const pChakra = getBasePFor(npcData, 'chakra');
        const pCorpo = getBasePFor(npcData, 'corpo');
        const pMana = getBasePFor(npcData, 'mana');
        const pAura = getBasePFor(npcData, 'aura');
        const pStatus = getBasePFor(npcData, 'status');
        
        const mPV = parseFloat(npcData.multiplicadorVida) || 1;
        const mPM = parseFloat(npcData.multiplicadorMorte) || 1;
        
        const ascensao = parseInt(npcData.ascensaoBase) || 1;
        const bonusAscensao = (ascensao - 1) * 100;
        
        const pvCalculado = Math.floor(((pVida + pChakra + pCorpo) / 3) * mPV) + bonusAscensao;
        const pmCalculado = Math.floor(((pMana + pAura + pStatus) / 3) * mPM) + bonusAscensao;

        return { pvMax: isNaN(pvCalculado) ? 1 : pvCalculado, pmMax: isNaN(pmCalculado) ? 1 : pmCalculado };
    };
    const { pvMax, pmMax } = getSupremas();

    const handleRegenerarTudo = () => {
        if (!window.confirm('Recuperar toda a Vida, Energias, Pontos e Ações deste NPC?')) return;
        const novoNpc = JSON.parse(JSON.stringify(npcData));
        
        ['vida', 'mana', 'aura', 'chakra', 'corpo'].forEach(k => {
            let mx = 0;
            try { mx = getMaximo(novoNpc, k); } catch(e) { mx = novoNpc[k]?.base || 0; }
            let mxEstavel = mx;
            try { mxEstavel = getMaximoSemFormas(novoNpc, k); } catch(e) { mxEstavel = mx; }
            const { mxDisplay } = calcularEscala(mx, k, mxEstavel);
            if (!novoNpc[k]) novoNpc[k] = {};
            novoNpc[k].atual = isNaN(mxDisplay) ? 0 : mxDisplay;
        });
        if (!novoNpc.pv) novoNpc.pv = {}; novoNpc.pv.atual = isNaN(pvMax) ? 0 : pvMax;
        if (!novoNpc.pm) novoNpc.pm = {}; novoNpc.pm.atual = isNaN(pmMax) ? 0 : pmMax;
        
        ['padrao', 'bonus', 'reacao'].forEach(tipo => {
            if (!novoNpc.acoes) novoNpc.acoes = {};
            if (!novoNpc.acoes[tipo]) novoNpc.acoes[tipo] = { max: 1, atual: 1 };
            novoNpc.acoes[tipo].atual = novoNpc.acoes[tipo].max;
        });
        onSaveNpc(novoNpc);
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        setUploadingImg(true);
        try {
            const url = await uploadImagem(file, `avatars_npcs/${npcData.id || 'desconhecido'}`);
            salvar('avatar.base', url);
        } catch (err) { alert('Erro ao pintar o avatar da Entidade!'); } 
        finally { setUploadingImg(false); }
    };

    const LinhaVital = ({ labelKey, fallbackLabel, vitalKey, overrideMax, subItens, corBarra, corTextoBarra = '#fff' }) => {
        const [aberto, setAberta] = useState(false);
        let rawMaximo = overrideMax !== undefined ? overrideMax : 0;
        let rawMaximoEstavel = rawMaximo;
        if (overrideMax === undefined) {
            try { rawMaximo = getMaximo(npcData, vitalKey); } catch(e) { rawMaximo = npcData[vitalKey]?.base || 0; }
            try { rawMaximoEstavel = getMaximoSemFormas(npcData, vitalKey); } catch(e) { rawMaximoEstavel = rawMaximo; }
        }
        if (isNaN(rawMaximo)) rawMaximo = 0;
        if (isNaN(rawMaximoEstavel)) rawMaximoEstavel = rawMaximo;

        const { mxDisplay, pVit } = calcularEscala(rawMaximo, vitalKey, rawMaximoEstavel);
        let atual = npcData[vitalKey]?.atual;
        if (atual === undefined || atual === null || atual === '') atual = mxDisplay; else atual = Number(atual);
        if (isNaN(atual)) atual = mxDisplay;
        if (atual > mxDisplay) atual = mxDisplay;

        return (
            <div style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: '1.2em' }}>
                    {subItens && <span onClick={() => setAberta(!aberto)} style={{ cursor: 'pointer', width: '20px', display: 'inline-block', userSelect: 'none', fontWeight: 'bold' }}>{aberto ? 'v ' : '> '}</span>}
                    <LabelMagicoNPC valor={getLabel(labelKey, fallbackLabel)} onChange={(v) => setLabel(labelKey, v)} />
                </div>
                <BarraVitalNPC atual={atual} maximo={mxDisplay} pVit={pVit} cor={corBarra} corTexto={corTextoBarra} onChangeAtual={(v) => salvar(`${vitalKey}.atual`, v)} />
                {aberto && subItens && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginLeft: '35px', marginTop: '12px' }}>
                        {subItens.map(sub => (
                            <div key={sub.labelKey} style={{ fontSize: '1.05em', display: 'flex', alignItems: 'center' }}>
                                <LabelMagicoNPC valor={getLabel(sub.labelKey, sub.fallbackLabel)} onChange={(v) => setLabel(sub.labelKey, v)} />
                                <span style={{ fontWeight: 'bold', fontStyle: 'italic', margin: '0 5px' }}>: (</span>
                                <CampoMagicoNPC valor={npcData[sub.key]?.base || ''} onChange={(v) => salvar(`${sub.key}.base`, v)} styleExtra={{ width: '90px' }} isNumber={true} type="number" />
                                <span style={{ fontWeight: 'bold', fontStyle: 'italic' }}>)</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const LinhaAtributoCru = ({ labelKey, fallbackLabel, attrKey, isAtual }) => {
        const baseVal = npcData[attrKey]?.base || '';
        let maxVal = 0;
        try { maxVal = getMaximo(npcData, attrKey); } catch(e) { maxVal = baseVal; }
        if (isNaN(maxVal)) maxVal = 0;
        return (
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted currentColor', padding: '6px 0', fontSize: '1.1em' }}>
                <LabelMagicoNPC valor={getLabel(labelKey, fallbackLabel)} onChange={(v) => setLabel(labelKey, v)} />
                {isAtual ? <span style={{ fontWeight: 'bold' }}>{Number(maxVal).toLocaleString('pt-BR')}</span> : <CampoMagicoNPC valor={baseVal} onChange={(v) => salvar(`${attrKey}.base`, v)} styleExtra={{ width: '100px', textAlign: 'right', fontWeight: 'bold' }} type="number" isNumber={true} />}
            </div>
        );
    };

    // 🔥 O MOTOR DA LUMINOSIDADE 🔥
    const getLuma = (hex) => {
        if (!hex) return 255;
        const c = hex.replace('#', '');
        const r = parseInt(c.substring(0, 2), 16) || 255;
        const g = parseInt(c.substring(2, 4), 16) || 255;
        const b = parseInt(c.substring(4, 6), 16) || 255;
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const isDarkFrame = localCorMoldura && getLuma(localCorMoldura) < 50;

    return (
        <div style={{ 
            width: '100%', minHeight: '85vh', 
            backgroundColor: localCorFundo,
            color: localCorTexto,
            fontFamily: fonteDiario, 
            padding: '40px 40px 80px 40px', borderRadius: '12px', position: 'relative', transition: 'background 0.3s ease, color 0.3s ease',
            boxShadow: 'inset 0 0 40px rgba(0,0,0,0.1), 0 10px 30px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
            overflow: 'visible', marginTop: '20px'
        }}>
            
            {/* 🔥 FUNDO ALQUÍMICO 🔥 */}
            {localBgImg && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none', borderRadius: '12px', overflow: 'hidden', mixBlendMode: localModoFundo, isolation: 'isolate' }}>
                    <img src={localBgImg} alt="Fundo" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0, filter: localModoFundo !== 'normal' ? 'contrast(1.2) saturate(1.2)' : 'none' }} />
                    {localCorFundoTint && localCorFundoTint !== '#ffffff' && (
                        <>
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: localCorFundoTint, mixBlendMode: 'color' }} />
                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: localCorFundoTint, mixBlendMode: 'overlay', opacity: 0.8 }} />
                        </>
                    )}
                </div>
            )}

            <style>{`
                .swoop-container { transform-style: preserve-3d; z-index: 1; position: relative; }
                @keyframes pageSwoopNext {
                    0% { transform: perspective(1500px) rotateY(-15deg) translateX(30px) scale(0.98); opacity: 0; }
                    100% { transform: perspective(1500px) rotateY(0deg) translateX(0) scale(1); opacity: 1; }
                }
                @keyframes pageSwoopPrev {
                    0% { transform: perspective(1500px) rotateY(15deg) translateX(-30px) scale(0.98); opacity: 0; }
                    100% { transform: perspective(1500px) rotateY(0deg) translateX(0) scale(1); opacity: 1; }
                }
                .page-swoop-next { animation: pageSwoopNext 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
                .page-swoop-prev { animation: pageSwoopPrev 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }

                .grimorio-estilo-papel { --tinta: ${localCorTinta || '#000'}; --fundo: ${localCorFundo || '#fff'}; color: var(--tinta) !important; }
                .grimorio-estilo-papel * { font-family: ${fonteDiario}, cursive !important; text-shadow: none !important; box-shadow: none !important; }
                .grimorio-estilo-papel .def-box {
                    background: transparent !important; border: 2px solid var(--tinta) !important;
                    border-radius: 2px 255px 3px 25px / 255px 5px 225px 3px !important; padding: 20px !important; margin-bottom: 20px !important; position: relative;
                }
                .grimorio-estilo-papel .def-box::before {
                    content: ''; position: absolute; top:0; left:0; right:0; bottom:0; background: var(--tinta); opacity: 0.03; pointer-events: none; border-radius: inherit;
                }
                .grimorio-estilo-papel h2, .grimorio-estilo-papel h3, .grimorio-estilo-papel h4 { color: var(--tinta) !important; display: inline-block; }
                .grimorio-estilo-papel button {
                    background: transparent !important; border: 2px dashed var(--tinta) !important; border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px !important;
                    color: var(--tinta) !important; font-weight: bold !important; text-transform: uppercase !important; transition: transform 0.2s ease !important;
                }
                .grimorio-estilo-papel button:hover { background: var(--tinta) !important; color: var(--fundo) !important; border-style: solid !important; transform: scale(1.02) rotate(-1deg) !important; }
            `}</style>

            <div style={{ position: 'absolute', top: '-25px', right: '30px', zIndex: 10, display: 'flex', gap: '15px' }}>
                <div style={{ position: 'relative' }}>
                    <button onClick={() => setModalEstilo(!modalEstilo)} style={{ background: '#ff94c2', color: '#000', border: '1px solid #333', borderBottom: '3px solid #222', padding: '10px 20px', fontFamily: 'inherit', fontWeight: 'bold', fontSize: '1.1em', cursor: 'pointer', borderRadius: '4px', boxShadow: '2px 4px 8px rgba(0,0,0,0.4)', transform: 'rotate(-2deg)' }}>🎨 Estilo do NPC</button>
                    {modalEstilo && (
                        <div className="fade-in" style={{ position: 'absolute', top: '55px', right: '0', background: '#ffe4f0', padding: '15px', border: '1px solid #ccc', boxShadow: '5px 5px 15px rgba(0,0,0,0.3)', width: '320px', zIndex: 20, borderRadius: '6px', color: '#000', maxHeight: '70vh', overflowY: 'auto' }}>
                            
                            {/* 🔥 COR DO TEXTO 🔥 */}
                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', fontWeight: 'bold' }}>Cor do Texto da Ficha:</label>
                            <input 
                                type="color" value={localCorTexto} 
                                onChange={(e) => handleStyleChange('corTexto', e.target.value)} 
                                style={{ width: '100%', height: '40px', border: 'none', cursor: 'pointer', marginBottom: '15px', background: 'transparent' }} 
                            />

                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', fontWeight: 'bold' }}>Cor do Papel (Fundo Base):</label>
                            <input 
                                type="color" value={localCorFundo} 
                                onChange={(e) => handleStyleChange('diarioCor', e.target.value)} 
                                style={{ width: '100%', height: '40px', border: 'none', cursor: 'pointer', marginBottom: '15px', background: 'transparent' }} 
                            />

                            {/* 🔥 FUNDO DA FICHA 🔥 */}
                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', fontWeight: 'bold' }}>🖼️ Imagem de Fundo (URL):</label>
                            <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                                <input 
                                    type="text" value={localBgImg} onChange={(e) => handleStyleChange('bgImg', e.target.value)} placeholder="Cole o Link aqui..."
                                    style={{ flex: 1, padding: '8px', border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', color: 'inherit' }} 
                                />
                                <label style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.2)', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Upload de Fundo">
                                    📁<input type="file" accept="image/*" onChange={handleBgUpload} style={{ display: 'none' }} />
                                </label>
                            </div>
                            <select value={localModoFundo} onChange={(e) => handleStyleChange('modoFundo', e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', fontFamily: 'inherit', marginBottom: '5px' }}>
                                <option value="normal">Fundo Normal</option>
                                <option value="screen">Apagar Preto (Screen)</option>
                                <option value="multiply">Apagar Branco (Multiply)</option>
                            </select>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9em', marginBottom: '15px', color: '#555', fontWeight: 'bold' }}>
                                <span>Tingir Fundo:</span>
                                <input type="color" value={localCorFundoTint} onChange={(e) => handleStyleChange('corFundoTint', e.target.value)} style={{ width: '40px', height: '25px', border: 'none', cursor: 'pointer', background: 'transparent' }} />
                            </label>

                            <hr style={{ border: '1px dashed #ccc', margin: '15px 0' }}/>

                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', fontWeight: 'bold' }}>✨ Moldura do Personagem:</label>
                            <div style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
                                <input 
                                    type="text" value={localMolduraAvatar} onChange={(e) => handleStyleChange('molduraAvatar', e.target.value)} placeholder="Cole o Link da moldura..."
                                    style={{ flex: 1, padding: '8px', border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', color: 'inherit' }} 
                                />
                                <label style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.2)', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Upload de Moldura">
                                    📁<input type="file" accept="image/*" onChange={handleMolduraUpload} style={{ display: 'none' }} />
                                </label>
                            </div>

                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', fontWeight: 'bold' }}>🪄 Remoção de Fundo (Moldura):</label>
                            <select value={localModoMoldura} onChange={(e) => handleStyleChange('modoMoldura', e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', fontFamily: 'inherit', marginBottom: '10px' }}>
                                <option value="screen">Fundo Preto (Magia Screen)</option>
                                <option value="multiply">Fundo Branco (Magia Multiply)</option>
                                <option value="normal">Nenhum / Imagem PNG Transparente</option>
                            </select>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9em', color: '#555', marginTop: '10px', fontWeight: 'bold' }}>
                                <span>Tingir Moldura & Ícone:</span>
                                <input 
                                    type="color" value={localCorMoldura} 
                                    onChange={(e) => handleStyleChange('corMoldura', e.target.value)} 
                                    style={{ width: '40px', height: '25px', border: 'none', cursor: 'pointer', background: 'transparent' }} 
                                    title="Tinge o dourado/metálico da moldura!"
                                />
                            </label>
                            <div style={{ display: 'flex', gap: '5px', marginBottom: '15px', marginTop: '5px' }}>
                                {['#ffffff', '#aa00ff', '#ffcc00', '#0088ff', '#ff003c', '#000000'].map(c => (
                                    <div key={c} onClick={() => handleStyleChange('corMoldura', c)} style={{ width: '20px', height: '20px', backgroundColor: c, border: '1px solid rgba(0,0,0,0.5)', cursor: 'pointer', borderRadius: '3px' }} title={`Pintar de ${c}`} />
                                ))}
                            </div>

                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', fontWeight: 'bold' }}>🔷 Ícone da Classe Manual (Opcional):</label>
                            <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
                                <input 
                                    type="text" value={localIconeClasse} onChange={(e) => handleStyleChange('iconeClasse', e.target.value)} placeholder="Link do Ícone..."
                                    style={{ flex: 1, padding: '8px', border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', color: 'inherit' }} 
                                />
                                <label style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.2)', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="Upload do Ícone">
                                    📁<input type="file" accept="image/*" onChange={handleIconeUpload} style={{ display: 'none' }} />
                                </label>
                            </div>

                            <hr style={{ border: '1px dashed #ccc', margin: '15px 0' }}/>

                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', fontWeight: 'bold' }}>Cor da Tinta (Radar):</label>
                            <input 
                                type="color" value={localCorTinta} 
                                onChange={(e) => handleStyleChange('corTintaRadar', e.target.value)} 
                                style={{ width: '100%', height: '40px', border: 'none', cursor: 'pointer', marginBottom: '15px', background: 'transparent' }} 
                            />
                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', fontWeight: 'bold' }}>Fonte da Letra:</label>
                            <select value={fonteDiario} onChange={(e) => salvar('estetica.diarioFonte', e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid rgba(0,0,0,0.2)', background: 'transparent', fontFamily: 'inherit' }}>
                                <option value='"Comic Sans MS", "Chalkboard SE", "Marker Felt", cursive'>✏️ Escrito à Mão</option>
                                <option value="'Courier New', Courier, monospace">🖨️ Máquina de Escrever</option>
                                <option value="'Times New Roman', Times, serif">📖 Grimório Clássico</option>
                            </select>
                        </div>
                    )}
                </div>
            </div>

            <div key={paginaAtual} className={`swoop-container ${animDirection === 'next' ? 'page-swoop-next' : 'page-swoop-prev'}`} style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '40px', paddingBottom: '30px' }}>
                
                {/* ======================= PÁGINA 1 ======================= */}
                {paginaAtual === 1 && (
                    <>
                        <div style={{ flex: '1 1 450px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', borderBottom: '2px solid currentColor', paddingBottom: '5px', marginBottom: '10px', width: 'fit-content' }}>
                                <span style={{ fontSize: '3.5em', fontStyle: 'italic', fontWeight: 'bold', margin: 0 }}>/</span>
                                <CampoMagicoNPC valor={npcData.nome} onChange={(v) => salvar('nome', v)} placeholder="Nome do NPC" styleExtra={{ fontSize: '3.5em', fontStyle: 'italic', fontWeight: 'bold', minWidth: '300px', width: 'auto', borderBottom: 'none' }} />
                                <span style={{ fontSize: '3.5em', fontStyle: 'italic', fontWeight: 'bold', margin: 0 }}>©</span>
                            </div>
                            <h2 style={{ fontSize: '2.2em', fontStyle: 'italic', fontWeight: 'bold', margin: '0 0 20px 0', display: 'flex', alignItems: 'center' }}>
                                <LabelMagicoNPC valor={getLabel('tituloLv', '- Limite quebrado - LV')} onChange={(v) => setLabel('tituloLv', v)} />
                                <CampoMagicoNPC valor={npcData.bio?.nivel} onChange={(v) => salvar('bio.nivel', v)} styleExtra={{ width: '60px', borderBottom: 'none', marginLeft: '10px' }} isNumber={true} type="number" />
                            </h2>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '1.2em' }}>
                                {[
                                    { k: 'idade', lbl: 'Idade' },
                                    { k: 'aniversario', lbl: 'Aniversário' },
                                    { k: 'alturaPeso', lbl: 'Altura / Peso' },
                                    { k: 'raca', lbl: 'Raça' },
                                    { k: 'alinhamento', lbl: 'Alinhamento' },
                                    { k: 'afiliacao', lbl: 'Afiliação', foraDaBio: true },
                                    { k: 'classe', lbl: 'Classe' }
                                ].map(item => (
                                    <div key={item.k} style={{ display: 'flex' }}>
                                        <div style={{ width: '140px', fontWeight: 'bold' }}>
                                            <LabelMagicoNPC valor={getLabel(`bio_${item.k}`, item.lbl)} onChange={(v) => setLabel(`bio_${item.k}`, v)} />
                                        </div>
                                        <span style={{ fontWeight: 'bold', marginRight: '8px' }}>:</span>
                                        <CampoMagicoNPC valor={item.foraDaBio ? npcData[item.k] : npcData.bio?.[item.k]} onChange={(v) => salvar(item.foraDaBio ? item.k : `bio.${item.k}`, v)} styleExtra={{ flex: 1, borderBottom: '1px dotted currentColor' }} />
                                    </div>
                                ))}
                            </div>

                            <div style={{ marginTop: '20px', position: 'relative', width: '320px', height: '480px', display: 'flex', flexDirection: 'column', borderRadius: '8px', border: npcData.avatar?.base ? 'none' : '2px dashed currentColor', boxShadow: npcData.avatar?.base ? '8px 8px 0px rgba(0,0,0,0.2)' : 'none', isolation: 'isolate' }}>
                                {uploadingImg ? (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', color: '#fff', fontWeight: 'bold', zIndex: 20 }}>✍️ Forjando...</div>
                                ) : npcData.avatar?.base ? (
                                    <>
                                        {/* 🔥 FOTO ESTICADA SEM CORTE 🔥 */}
                                        <img src={npcData.avatar.base} alt="Avatar" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', zIndex: 1, borderRadius: '8px' }} />
                                        
                                        {/* 🔥 MOLDURA COM ALQUIMIA DE COR FORTE E FUNDO 🔥 */}
                                        {localMolduraAvatar && (
                                            <div style={{ position: 'absolute', top: '-3%', left: '-3%', width: '106%', height: '106%', zIndex: 2, pointerEvents: 'none', mixBlendMode: localModoMoldura, isolation: 'isolate' }}>
                                                <img src={localMolduraAvatar} alt="Moldura" style={{ width: '100%', height: '100%', objectFit: 'fill', position: 'absolute', top: 0, left: 0, filter: 'contrast(1.2) saturate(1.2)' }} />
                                                
                                                {/* CAMADA DE COR FORTE (Color + Overlay) */}
                                                {localCorMoldura && localCorMoldura !== '#ffffff' && (
                                                    <>
                                                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: localCorMoldura, mixBlendMode: 'color' }} />
                                                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: localCorMoldura, mixBlendMode: 'overlay', opacity: 0.8 }} />
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        {/* 🔥 O ÍCONE DA CLASSE PERFEITO (COM MÁSCARA EXATA PARA NÃO VAZAR O QUADRADO) */}
                                        {(classeInfo || localIconeClasse) && (
                                            <div style={{ position: 'absolute', bottom: '-8px', left: '50%', transform: 'translateX(-50%)', zIndex: 3, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '70px', height: '70px' }}>
                                                {iconeFinal ? (
                                                    <div style={{ position: 'relative', width: '100%', height: '100%', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))', isolation: 'isolate' }}>
                                                        {/* Imagem Original Base */}
                                                        <img src={iconeFinal} alt="Classe" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
                                                        
                                                        {/* Camadas de Cor recortadas pela Máscara para não pintar o quadrado inteiro! */}
                                                        {localCorMoldura && localCorMoldura !== '#ffffff' && (
                                                            <>
                                                                <div style={{ 
                                                                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: localCorMoldura, mixBlendMode: 'color',
                                                                    WebkitMaskImage: `url(${iconeFinal})`, WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'center',
                                                                    maskImage: `url(${iconeFinal})`, maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center'
                                                                }} />
                                                                <div style={{ 
                                                                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: localCorMoldura, mixBlendMode: 'overlay', opacity: 0.8,
                                                                    WebkitMaskImage: `url(${iconeFinal})`, WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'center',
                                                                    maskImage: `url(${iconeFinal})`, maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center'
                                                                }} />
                                                            </>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div style={{ width: '50px', height: '50px', background: (localCorMoldura && localCorMoldura !== '#ffffff') ? localCorMoldura : classeInfo.cor, transform: 'rotate(45deg)', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.8)' }}>
                                                        <span style={{ transform: 'rotate(-45deg)', fontSize: '1.5em', textShadow: '0 2px 4px rgba(0,0,0,0.5)', color: '#fff' }}>{classeInfo.icone}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        
                                        <label style={{ cursor: 'pointer', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10 }}>
                                            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                                        </label>
                                    </>
                                ) : (
                                    <label style={{ cursor: 'pointer', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'currentColor', opacity: 0.7, background: 'rgba(255,255,255,0.1)' }}>
                                        Colar Fotografia Aqui 📸
                                        <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                                    </label>
                                )}
                            </div>
                            {npcData.avatar?.base && <button onClick={() => {if(window.confirm('Apagar?')) salvar('avatar.base', '');}} style={{ background: 'transparent', border: '1px dashed #ff003c', color: '#ff003c', marginTop: '10px', padding: '5px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit', width: 'fit-content' }}>🗑️ Remover Foto</button>}
                        </div>

                        <div style={{ flex: '1 1 450px', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 10px 5px' }}>
                                <h2 style={{ fontSize: '2em', fontStyle: 'italic', fontWeight: 'bold', margin: 0, display: 'flex' }}><LabelMagicoNPC valor={getLabel('tituloBase', '> STATUS PRINCIPAIS')} onChange={(v) => setLabel('tituloBase', v)} /></h2>
                                <button onClick={handleRegenerarTudo} style={{ background: 'rgba(255,255,255,0.4)', border: '2px solid currentColor', padding: '5px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'inherit', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '2px 2px 5px rgba(0,0,0,0.2)' }}><span>💖</span> Curar NPC</button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <LinhaVital labelKey="lblVida" fallbackLabel="Vida (HP)" vitalKey="vida" corBarra="#ff0000" />
                                <LinhaVital labelKey="lblMana" fallbackLabel="Mana" vitalKey="mana" corBarra="#0000ff" subItens={[ { labelKey: 'lblInt', fallbackLabel: 'Inteligência', key: 'inteligencia' }, { labelKey: 'lblSab', fallbackLabel: 'Sabedoria', key: 'sabedoria' } ]} />
                                <LinhaVital labelKey="lblAura" fallbackLabel="Aura" vitalKey="aura" corBarra="#aa00ff" subItens={[ { labelKey: 'lblEsp', fallbackLabel: 'Energia Espiritual', key: 'energiaEsp' }, { labelKey: 'lblCar', fallbackLabel: 'Carisma', key: 'carisma' } ]} />
                                <LinhaVital labelKey="lblChakra" fallbackLabel="Chakra" vitalKey="chakra" corBarra="#00cc00" subItens={[ { labelKey: 'lblSta', fallbackLabel: 'Stamina', key: 'stamina' }, { labelKey: 'lblCon', fallbackLabel: 'Constituição', key: 'constituicao' } ]} />
                                <LinhaVital labelKey="lblCorpo" fallbackLabel="Corpo" vitalKey="corpo" corBarra="#000000" corTextoBarra="#fff" subItens={[ { labelKey: 'lblDes', fallbackLabel: 'Destreza', key: 'destreza' }, { labelKey: 'lblFor', fallbackLabel: 'Força', key: 'forca' } ]} />
                            </div>

                            <h2 style={{ fontSize: '1.6em', fontStyle: 'italic', fontWeight: 'bold', margin: '20px 0 10px 5px', display: 'flex' }}><LabelMagicoNPC valor={getLabel('tituloPrimordial', '> ENERGIAS PRIMORDIAIS')} onChange={(v) => setLabel('tituloPrimordial', v)} /></h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <div style={{ marginBottom: '5px' }}>
                                    <LabelMagicoNPC valor={getLabel('lblPV', 'Pontos Vitais (PV)')} onChange={(v) => setLabel('lblPV', v)} />
                                    <BarraVitalNPC atual={npcData.pv?.atual !== undefined && npcData.pv?.atual !== '' ? Number(npcData.pv.atual) : pvMax} maximo={pvMax} pVit={0} cor="#ffffff" corTexto="#000" onChangeAtual={(v) => salvar('pv.atual', v)} />
                                </div>
                                <div style={{ marginBottom: '15px' }}>
                                    <LabelMagicoNPC valor={getLabel('lblPM', 'Pontos Mortais (PM)')} onChange={(v) => setLabel('lblPM', v)} />
                                    <BarraVitalNPC atual={npcData.pm?.atual !== undefined && npcData.pm?.atual !== '' ? Number(npcData.pm.atual) : pmMax} maximo={pmMax} pVit={0} cor="#000000" corTexto="#fff" onChangeAtual={(v) => salvar('pm.atual', v)} />
                                </div>

                                <div style={{ display: 'flex', gap: '15px', marginTop: '5px' }}>
                                    <div style={{ flex: 1, border: '2px solid currentColor', padding: '10px', borderRadius: '6px', background: 'rgba(255,255,255,0.2)' }}>
                                        <div style={{ fontSize: '0.8em', fontWeight: 'bold', textTransform: 'uppercase' }}><LabelMagicoNPC valor={getLabel('lblMultV', 'Mult. de Vida (PV)')} onChange={(v) => setLabel('lblMultV', v)} /></div>
                                        <CampoMagicoNPC valor={npcData.multiplicadorVida || 1} onChange={(v) => salvar('multiplicadorVida', v)} type="number" isNumber={true} styleExtra={{ width: '100%', borderBottom: '1px solid currentColor', marginTop: '5px' }} />
                                    </div>
                                    <div style={{ flex: 1, border: '2px solid currentColor', padding: '10px', borderRadius: '6px', background: 'rgba(255,255,255,0.2)' }}>
                                        <div style={{ fontSize: '0.8em', fontWeight: 'bold', textTransform: 'uppercase' }}><LabelMagicoNPC valor={getLabel('lblMultM', 'Mult. de Morte (PM)')} onChange={(v) => setLabel('lblMultM', v)} /></div>
                                        <CampoMagicoNPC valor={npcData.multiplicadorMorte || 1} onChange={(v) => salvar('multiplicadorMorte', v)} type="number" isNumber={true} styleExtra={{ width: '100%', borderBottom: '1px solid currentColor', marginTop: '5px' }} />
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginTop: '30px', border: '2px dashed currentColor', padding: '20px', borderRadius: '10px', position: 'relative' }}>
                                <span style={{ position: 'absolute', top: '-15px', left: '20px', background: localCorFundo, padding: '0 10px', fontSize: '1.2em', transition: 'background 0.2s ease' }}><LabelMagicoNPC valor={getLabel('tituloTurno', 'Ações de Turno')} onChange={(v) => setLabel('tituloTurno', v)} /></span>
                                <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginTop: '10px' }}>
                                    {['padrao', 'bonus', 'reacao'].map(tipo => {
                                        const acao = npcData.acoes?.[tipo] || { max: 1, atual: 1 };
                                        return (
                                            <div key={tipo} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ fontSize: '1.1em' }}><LabelMagicoNPC valor={getLabel(`acao_${tipo}`, tipo.toUpperCase())} onChange={(v) => setLabel(`acao_${tipo}`, v)} /></span>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    {Array.from({ length: acao.max }).map((_, i) => (
                                                        <div key={i} onClick={() => salvar(`acoes.${tipo}.atual`, i >= acao.atual ? acao.atual + 1 : acao.atual - 1)}
                                                            style={{ width: '25px', height: '25px', border: '2px solid currentColor', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '1.2em', color: '#ff003c', background: 'rgba(255,255,255,0.2)' }}>
                                                            {i >= acao.atual ? 'X' : ''}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* ======================= PÁGINA 2 ======================= */}
                {paginaAtual === 2 && (
                    <>
                        <div style={{ width: '100%', textAlign: 'center', borderBottom: '2px solid currentColor', paddingBottom: '10px', marginBottom: '20px' }}>
                            <h1 style={{ fontSize: '3em', fontStyle: 'italic', fontWeight: 'bold', margin: 0, letterSpacing: '-1px' }}><LabelMagicoNPC valor={getLabel('tituloAnalise', 'Análise de Poder')} onChange={(v) => setLabel('tituloAnalise', v)} /></h1>
                        </div>

                        <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(0,0,0,0.03)', padding: '20px', borderRadius: '15px', border: '1px dashed currentColor' }}>
                            <h2 style={{ fontSize: '2em', fontStyle: 'italic', fontWeight: 'bold', margin: '0 0 20px 0' }}><LabelMagicoNPC valor={getLabel('tituloAnaliseBase', 'Status (Rank Base)')} onChange={(v) => setLabel('tituloAnaliseBase', v)} /></h2>
                            <RadarDesenhadoNPC ficha={npcData} isAtual={false} corTinta={localCorTinta} />
                            
                            <div style={{ width: '100%', maxWidth: '300px', marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <LinhaAtributoCru labelKey="lblFor" fallbackLabel="Força" attrKey="forca" isAtual={false} />
                                <LinhaAtributoCru labelKey="lblDes" fallbackLabel="Destreza" attrKey="destreza" isAtual={false} />
                                <LinhaAtributoCru labelKey="lblInt" fallbackLabel="Inteligência" attrKey="inteligencia" isAtual={false} />
                                <LinhaAtributoCru labelKey="lblSab" fallbackLabel="Sabedoria" attrKey="sabedoria" isAtual={false} />
                                <LinhaAtributoCru labelKey="lblEsp" fallbackLabel="Energia Espiritual" attrKey="energiaEsp" isAtual={false} />
                                <LinhaAtributoCru labelKey="lblCar" fallbackLabel="Carisma" attrKey="carisma" isAtual={false} />
                                <LinhaAtributoCru labelKey="lblSta" fallbackLabel="Stamina" attrKey="stamina" isAtual={false} />
                                <LinhaAtributoCru labelKey="lblCon" fallbackLabel="Constituição" attrKey="constituicao" isAtual={false} />
                            </div>
                        </div>

                        <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(0,0,0,0.05)', padding: '20px', borderRadius: '15px', border: '2px solid currentColor' }}>
                            <h2 style={{ fontSize: '2em', fontStyle: 'italic', fontWeight: 'bold', margin: '0 0 20px 0' }}><LabelMagicoNPC valor={getLabel('tituloAnaliseAtual', 'Poder Atual (c/ Formas)')} onChange={(v) => setLabel('tituloAnaliseAtual', v)} /></h2>
                            <RadarDesenhadoNPC ficha={npcData} isAtual={true} corTinta={localCorTinta} />
                            
                            <div style={{ width: '100%', maxWidth: '300px', marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <LinhaAtributoCru labelKey="lblFor" fallbackLabel="Força" attrKey="forca" isAtual={true} />
                                <LinhaAtributoCru labelKey="lblDes" fallbackLabel="Destreza" attrKey="destreza" isAtual={true} />
                                <LinhaAtributoCru labelKey="lblInt" fallbackLabel="Inteligência" attrKey="inteligencia" isAtual={true} />
                                <LinhaAtributoCru labelKey="lblSab" fallbackLabel="Sabedoria" attrKey="sabedoria" isAtual={true} />
                                <LinhaAtributoCru labelKey="lblEsp" fallbackLabel="Energia Espiritual" attrKey="energiaEsp" isAtual={true} />
                                <LinhaAtributoCru labelKey="lblCar" fallbackLabel="Carisma" attrKey="carisma" isAtual={true} />
                                <LinhaAtributoCru labelKey="lblSta" fallbackLabel="Stamina" attrKey="stamina" isAtual={true} />
                                <LinhaAtributoCru labelKey="lblCon" fallbackLabel="Constituição" attrKey="constituicao" isAtual={true} />
                            </div>
                        </div>

                        {/* 🔥 TABELA SUPREMA PARA OS NPCs */}
                        <div style={{ width: '100%', marginTop: '30px', background: 'rgba(0,0,0,0.03)', padding: '20px', borderRadius: '15px', border: '1px dashed currentColor' }}>
                            <h2 style={{ fontSize: '1.8em', fontStyle: 'italic', fontWeight: 'bold', margin: '0 0 20px 0', textAlign: 'center', color: 'inherit' }}>Mecânicas de Ascensão e Divisores</h2>

                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                                <div style={{ background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '10px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '15px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.1em' }}>Ascensão Base (Nível):</span>
                                    <CampoMagicoNPC valor={npcData.ascensaoBase || 1} onChange={(v) => salvar('ascensaoBase', v)} type="number" isNumber={true} styleExtra={{ width: '60px', textAlign: 'center', color: '#fff', borderBottom: '1px dashed #fff', fontSize: '1.2em' }} />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
                                {['vida', 'mana', 'aura', 'chakra', 'corpo', 'status'].map(k => {
                                    const displayP = getBasePFor(npcData, k);
                                    const divisor = npcData.divisores?.[k] || 1;

                                    return (
                                        <div key={k} style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.05)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 'bold', color: 'inherit', fontSize: '1.1em' }}>{k.toUpperCase()}</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9em' }}>
                                                    <span style={{ fontStyle: 'italic', fontWeight: 'bold' }}>Divisor:</span>
                                                    <CampoMagicoNPC valor={divisor} onChange={v => handleTabelaChange(k, 'divisor', v)} type="number" isNumber={true} styleExtra={{ width: '50px', textAlign: 'center', border: '1px solid currentColor', borderRadius: '4px', background: 'rgba(255,255,255,0.5)' }} />
                                                </div>
                                            </div>
                                            <div style={{ width: '100%', background: 'rgba(0,0,0,0.85)', borderRadius: '6px', padding: '5px', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
                                                <CampoMagicoNPC 
                                                    valor={displayP} 
                                                    onChange={v => handleTabelaChange(k, 'prestigio', v)} 
                                                    type="number" 
                                                    isNumber={true} 
                                                    styleExtra={{ width: '100%', textAlign: 'center', color: '#fff', borderBottom: 'none', fontSize: '1.4em', fontWeight: 'bold' }} 
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}

                {/* ======================= PÁGINA 3 ======================= */}
                {paginaAtual === 3 && (
                    <div className="grimorio-estilo-papel" style={{ width: '100%' }}>
                        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                            <h1 style={{ fontSize: '3em', fontStyle: 'italic', fontWeight: 'bold', margin: 0, paddingBottom: '10px', borderBottom: `2px dashed ${localCorTinta}` }}>
                                <LabelMagicoNPC valor={getLabel('tituloPg3', 'O Grimório Místico')} onChange={(v) => setLabel('tituloPg3', v)} />
                            </h1>
                        </div>

                        {/* 🌀 ARSENAL DOS MONSTROS (SIMPLIFICADO E ESTILIZADO) */}
                        <div className="def-box">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <h2 style={{ margin: 0 }}>🌀 Arsenal de Poderes</h2>
                                <button onClick={() => handleArrayItem('poderes', 'add')}>+ Novo Poder</button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {(npcData.poderes || []).map((pod, i) => (
                                    <div key={i} className="def-box" style={{ position: 'relative' }}>
                                        <button onClick={() => { if(window.confirm('Apagar Poder?')) handleArrayItem('poderes', 'remove', i); }} style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', cursor: 'pointer' }}>✖</button>
                                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap', paddingRight: '30px' }}>
                                            <CampoMagicoNPC valor={pod.nome} onChange={v => handleArrayItem('poderes', 'update', i, 'nome', v)} placeholder="Nome do Poder" styleExtra={{ flex: '1 1 200px', fontSize: '1.2em', fontWeight: 'bold' }} />
                                            <CampoMagicoNPC valor={pod.custo} onChange={v => handleArrayItem('poderes', 'update', i, 'custo', v)} placeholder="Custo (ex: 50 MP)" styleExtra={{ flex: '1 1 100px' }} />
                                            <CampoMagicoNPC valor={pod.dano} onChange={v => handleArrayItem('poderes', 'update', i, 'dano', v)} placeholder="Dano/Efeito" styleExtra={{ flex: '1 1 100px' }} />
                                        </div>
                                        <AreaMagicaNPC valor={pod.descricao} onChange={v => handleArrayItem('poderes', 'update', i, 'descricao', v)} placeholder="Descreva os efeitos mágicos deste poder..." />
                                    </div>
                                ))}
                                {(!npcData.poderes || npcData.poderes.length === 0) && <span style={{ fontStyle: 'italic', opacity: 0.6 }}>Nenhum poder forjado ainda...</span>}
                            </div>
                        </div>

                        {/* ♾️ O INFINITY */}
                        <div className="def-box">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <h2 style={{ margin: 0 }}>♾️ O Infinity</h2>
                                <button onClick={() => handleArrayItem('infinitys', 'add')}>+ Novo Infinity</button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {(npcData.infinitys || []).map((inf, i) => (
                                    <div key={i} className="def-box" style={{ position: 'relative' }}>
                                        <button onClick={() => { if(window.confirm('Apagar Infinity?')) handleArrayItem('infinitys', 'remove', i); }} style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', cursor: 'pointer' }}>✖</button>
                                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap', paddingRight: '30px' }}>
                                            <CampoMagicoNPC valor={inf.nome} onChange={v => handleArrayItem('infinitys', 'update', i, 'nome', v)} placeholder="Nome do Domínio" styleExtra={{ flex: '1 1 200px', fontSize: '1.2em', fontWeight: 'bold' }} />
                                            <CampoMagicoNPC valor={inf.custo} onChange={v => handleArrayItem('infinitys', 'update', i, 'custo', v)} placeholder="Gatilho/Custo" styleExtra={{ flex: '1 1 100px' }} />
                                        </div>
                                        <AreaMagicaNPC valor={inf.descricao} onChange={v => handleArrayItem('infinitys', 'update', i, 'descricao', v)} placeholder="Descreva as regras absolutas deste domínio..." />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ✨ SINGULARIDADE */}
                        <div className="def-box">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <h2 style={{ margin: 0 }}>✨ Singularidade</h2>
                                <button onClick={() => handleArrayItem('singularidades', 'add')}>+ Singularidade</button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {(npcData.singularidades || []).map((sing, i) => (
                                    <div key={i} className="def-box" style={{ position: 'relative' }}>
                                        <button onClick={() => { if(window.confirm('Apagar Singularidade?')) handleArrayItem('singularidades', 'remove', i); }} style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', cursor: 'pointer' }}>✖</button>
                                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap', paddingRight: '30px' }}>
                                            <CampoMagicoNPC valor={sing.nome} onChange={v => handleArrayItem('singularidades', 'update', i, 'nome', v)} placeholder="Essência Única" styleExtra={{ flex: '1 1 200px', fontSize: '1.2em', fontWeight: 'bold' }} />
                                            <CampoMagicoNPC valor={sing.custo} onChange={v => handleArrayItem('singularidades', 'update', i, 'custo', v)} placeholder="Passiva / Ativa" styleExtra={{ flex: '1 1 100px' }} />
                                        </div>
                                        <AreaMagicaNPC valor={sing.descricao} onChange={v => handleArrayItem('singularidades', 'update', i, 'descricao', v)} placeholder="O poder que quebra as regras do universo..." />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

            </div>

            <div style={{ position: 'absolute', bottom: '20px', left: '0', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', fontFamily: 'inherit' }}>
                <button onClick={() => mudarPagina(Math.max(1, paginaAtual - 1))} disabled={paginaAtual === 1} style={{ background: 'transparent', border: 'none', fontSize: '1.2em', fontWeight: 'bold', cursor: paginaAtual === 1 ? 'default' : 'pointer', opacity: paginaAtual === 1 ? 0.3 : 1, fontFamily: 'inherit', color: 'inherit' }}>⮜ Anterior</button>
                <span style={{ fontSize: '1.1em', fontWeight: 'bold', borderBottom: '2px solid currentColor', padding: '0 10px' }}>Página {paginaAtual} de 3</span>
                <button onClick={() => mudarPagina(Math.min(3, paginaAtual + 1))} disabled={paginaAtual === 3} style={{ background: 'transparent', border: 'none', fontSize: '1.2em', fontWeight: 'bold', cursor: paginaAtual === 3 ? 'default' : 'pointer', opacity: paginaAtual === 3 ? 0.3 : 1, fontFamily: 'inherit', color: 'inherit' }}>Próxima ⮞</button>
            </div>

        </div>
    );
}