import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';
import { getMaximo } from '../../core/attributes.js';

// ==========================================
// 🌌 CONSTANTES DE ELEMENTOS
// ==========================================
const ELEMENTOS_OPCOES = [
    { label: 'Elementos Básicos', opcoes: ['Fogo', 'Agua', 'Raio', 'Terra', 'Vento'] },
    { label: 'Básicos Verdadeiros', opcoes: ['Fogo Verdadeiro', 'Agua Verdadeira', 'Raio Verdadeiro', 'Terra Verdadeira', 'Vento Verdadeiro'] },
    { label: 'Elementos Avançados', opcoes: ['Solar', 'Energia', 'Gelo', 'Vacuo', 'Natureza'] },
    { label: 'Avançados Verdadeiros', opcoes: ['Solar Verdadeiro', 'Energia Verdadeira', 'Gelo Verdadeiro', 'Vacuo Verdadeiro', 'Natureza Verdadeira'] },
    { label: 'Elementos Primordiais', opcoes: ['Luz', 'Trevas', 'Ether', 'Celestial', 'Infernal', 'Caos', 'Criacao', 'Destruicao', 'Cosmos'] },
    { label: 'Elementos Astrais', opcoes: ['Vida', 'Morte', 'Vazio'] },
    { label: 'Kekkei Genkai / Touta', opcoes: ['Elemento Madeira', 'Elemento Mineral', 'Elemento Cinzas', 'Elemento Igneo', 'Elemento Lava', 'Elemento Vapor', 'Elemento Nevoa', 'Elemento Tempestade', 'Elemento Areia', 'Elemento Tufao', 'Elemento Velocidade', 'Elemento Poeira', 'Elemento Calor', 'Elemento Cal', 'Elemento Carbono', 'Elemento Veneno', 'Elemento Magnetismo', 'Elemento Som'] },
    { label: 'Magias Ancestrais', opcoes: ['Truques Ancestrais', 'Magia de Sangue', 'Magia de Osso', 'Magia Draconica', 'Magia de Borracha', 'Magia de Espelho', 'Magia de Sal', 'Magia de Alma', 'Magia de Tremor', 'Magia de Gravidade', 'Magia de Tempo', 'Magia de Equipamento', 'Magia de Explosao', 'Magia Espacial', 'Magia de Metamorfose'] },
    { label: 'Magias Arcanas/Negras', opcoes: ['Truques Arcanos/Negros', 'Magias Arcanas/Negra de 1º Ciclo', 'Magias Arcanas/Negra de 2º Ciclo', 'Magias Arcanas/Negra de 3º Ciclo', 'Magias Arcanas/Negra de 4º Ciclo', 'Magias Arcanas/Negra de 5º Ciclo', 'Magias Arcanas/Negra de 6º Ciclo', 'Magias Arcanas/Negra de 7º Ciclo', 'Magias Arcanas/Negra de 8º Ciclo', 'Magias Arcanas/Negra de 9º Ciclo', 'Magias Arcanas/Negra de 10º Ciclo'] },
    { label: 'Magias de Ciclo', opcoes: ['Truques de Ciclo', 'Magias de 1º Ciclo', 'Magias de 2º Ciclo', 'Magias de 3º Ciclo', 'Magias de 4º Ciclo', 'Magias de 5º Ciclo', 'Magias de 6º Ciclo', 'Magias de 7º Ciclo', 'Magias de 8º Ciclo', 'Magias de 9º Ciclo', 'Magias de 10º Ciclo'] },
    { label: 'Manifestações e Fusões', opcoes: ['Aura Pura', 'Projeção de Aura', 'Artes Marciais', 'Reforço Físico', 'Fusões Básicas', 'Fusões Avançadas'] }
];

// ==========================================
// 📖 OS CAPÍTULOS DA CLASSIFICAÇÃO
// ==========================================
const CAPITULOS = [
    { id: 'registros', label: 'Hierarquia da Alma', icon: '📖' },
    { id: 'acumulativo', label: 'Marcadores & Adaptação', icon: '⚖️' },
    { id: 'forja', label: 'Forja de Calamidade', icon: '🌌' },
    { id: 'elemental', label: 'Reator de Ressonância', icon: '🌪️' },
    { id: 'conceitual', label: 'Distorção Conceitual', icon: '🧩' },
    { id: 'utilitario', label: 'Matriz Utilitária', icon: '🛠️' }
];

// ==========================================
// 🧠 CONTEXTO ISOLADO DA CLASSIFICAÇÃO
// ==========================================
const ClassificacaoContext = createContext(null);

export function useClassificacao() {
    return useContext(ClassificacaoContext);
}

export function ClassificacaoProvider({ children }) {
    const minhaFicha = useStore(s => s.minhaFicha);
    const updateFicha = useStore(s => s.updateFicha);
    const isMestre = useStore(s => s.isMestre);
    const [abaAtual, setAbaAtual] = useState('registros');

    // Funções de Save
    const callSave = useCallback(() => { salvarFichaSilencioso(); }, []);

    // Marcadores
    const [novoTrackerNome, setNovoTrackerNome] = useState('');
    const [novoTrackerValor, setNovoTrackerValor] = useState('');

    // Forja
    const [forja, setForja] = useState({ vida: true, energias: true, status: false, multGeral: false, danoBruto: true });
    const [forjaValor, setForjaValor] = useState('');

    // Distorção & Utilitária
    const [novaLeiNome, setNovaLeiNome] = useState('');
    const [novaCopiaNome, setNovaCopiaNome] = useState('');
    const [novaCopiaEfeito, setNovaCopiaEfeito] = useState('');

    const value = {
        minhaFicha, updateFicha, isMestre, abaAtual, setAbaAtual, callSave,
        novoTrackerNome, setNovoTrackerNome, novoTrackerValor, setNovoTrackerValor,
        forja, setForja, forjaValor, setForjaValor,
        novaLeiNome, setNovaLeiNome, novaCopiaNome, setNovaCopiaNome, novaCopiaEfeito, setNovaCopiaEfeito
    };

    return <ClassificacaoContext.Provider value={value}>{children}</ClassificacaoContext.Provider>;
}

// ==========================================
// 🖋️ COMPONENTES VISUAIS (ESTILO GRIMÓRIO)
// ==========================================
const CampoMagico = ({ valor, onChange, placeholder, styleExtra = {}, type = "text", disabled = false }) => {
    const { callSave } = useClassificacao();
    return (
        <input 
            type={type} value={valor || ''} onChange={e => onChange(e.target.value)} 
            onBlur={callSave} placeholder={placeholder} disabled={disabled}
            style={{ background: 'transparent', border: 'none', borderBottom: '1px dashed currentColor', fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit', fontWeight: 'inherit', fontStyle: 'inherit', outline: 'none', padding: '5px', width: '100%', opacity: disabled ? 0.7 : 1, ...styleExtra }} 
        />
    );
};

const AreaMagica = ({ valor, onChange, placeholder, styleExtra = {}, disabled = false }) => {
    const { callSave } = useClassificacao();
    return (
        <textarea 
            value={valor || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            onBlur={callSave} disabled={disabled}
            style={{ width: '100%', minHeight: '60px', background: 'transparent', border: 'none', borderBottom: '2px dotted currentColor', color: 'inherit', fontFamily: 'inherit', padding: '8px', outline: 'none', resize: 'vertical', opacity: disabled ? 0.7 : 1, ...styleExtra }}
        />
    );
};

// 📚 O NAVEGADOR DE CAPÍTULOS
function ClassificacaoNavegacao() {
    const { abaAtual, setAbaAtual } = useClassificacao();
    const indexAtual = CAPITULOS.findIndex(c => c.id === abaAtual);
    const total = CAPITULOS.length;
    const dadosAba = CAPITULOS[indexAtual];

    const irPara = (novoIndex) => {
        if (novoIndex >= 0 && novoIndex < total) setAbaAtual(CAPITULOS[novoIndex].id);
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px dashed currentColor', paddingBottom: '15px', marginBottom: '20px' }}>
            <button onClick={() => irPara(indexAtual - 1)} disabled={indexAtual === 0} style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: '1.2em', cursor: indexAtual === 0 ? 'default' : 'pointer', opacity: indexAtual === 0 ? 0.3 : 1, fontWeight: 'bold' }}>
                ⮜ FOLHEAR PARA TRÁS
            </button>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <select 
                    value={abaAtual} 
                    onChange={(e) => setAbaAtual(e.target.value)}
                    style={{ background: 'transparent', color: 'inherit', border: 'none', borderBottom: '1px dotted currentColor', fontSize: '0.9em', textTransform: 'uppercase', letterSpacing: '1px', outline: 'none', cursor: 'pointer', textAlign: 'center', opacity: 0.8 }}
                >
                    {CAPITULOS.map((c, i) => (
                        <option key={c.id} value={c.id} style={{ background: '#1e1423', color: '#e6d5b8' }}>
                            CAPÍTULO {i + 1} DE {total}: {c.label.toUpperCase()}
                        </option>
                    ))}
                </select>
                
                <h2 style={{ margin: '5px 0 0 0', fontSize: '1.8em', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span>{dadosAba.icon}</span> {dadosAba.label}
                </h2>
            </div>

            <button onClick={() => irPara(indexAtual + 1)} disabled={indexAtual === total - 1} style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: '1.2em', cursor: indexAtual === total - 1 ? 'default' : 'pointer', opacity: indexAtual === total - 1 ? 0.3 : 1, fontWeight: 'bold' }}>
                FOLHEAR PARA FRENTE ⮞
            </button>
        </div>
    );
}

// ==========================================
// 📖 CAPÍTULO 1: HIERARQUIA DA ALMA
// ==========================================
function PaginaRegistros() {
    const { minhaFicha, updateFicha, callSave, isMestre } = useClassificacao();

    const hierarquia = minhaFicha?.hierarquia || {};
    const hPoder = hierarquia.poder || false;
    const hInfinity = hierarquia.infinity || false;
    const hSingularidade = hierarquia.singularidade || '';

    const [hTextos, setHTextos] = useState({
        poderNome: '', poderDesc: '', poderVertente: '', poderElemento: '', poderAfeta: '',
        infinityNome: '', infinityDesc: '', infinityVertente: '', infinityElemento: '', infinityAfeta: '',
        singularidadeNome: '', singularidadeDesc: ''
    });
    const [salvandoClassificacao, setSalvandoClassificacao] = useState(false);

    useEffect(() => {
        const h = minhaFicha?.hierarquia || {};
        setHTextos({
            poderNome: h.poderNome || '', poderDesc: h.poderDesc || '', poderVertente: h.poderVertente || '',
            poderElemento: h.poderElemento || '', poderAfeta: h.poderAfeta || '',
            infinityNome: h.infinityNome || '', infinityDesc: h.infinityDesc || '', infinityVertente: h.infinityVertente || '',
            infinityElemento: h.infinityElemento || '', infinityAfeta: h.infinityAfeta || '',
            singularidadeNome: h.singularidadeNome || '', singularidadeDesc: h.singularidadeDesc || ''
        });
    }, [minhaFicha?.hierarquia]);

    // 🔥 Antes, os campos de texto/select desta página (poderNome, poderDesc, etc.) só
    // atualizavam hTextos (useState local) — nunca chegavam a minhaFicha.hierarquia até o
    // usuário clicar no botão "SALVAR CLASSIFICAÇÃO NA ALMA". Como o "onBlur" de
    // CampoMagico/AreaMagica chama callSave() (salvarFichaSilencioso, que salva a ficha
    // JÁ EXISTENTE no store), sair do campo sem clicar nesse botão específico dava a
    // impressão de "nunca salva" — o valor digitado nunca tinha entrado na ficha pra
    // começar. Agora cada edição já propaga pra minhaFicha.hierarquia na hora (mesmo
    // padrão usado por salvar() no resto da Ficha), então tanto o onBlur quanto o botão
    // "💾 Guardar Ficha" da tela principal persistem corretamente.
    const atualizarTextoHierarquia = (campo, valor) => {
        setHTextos(prev => ({ ...prev, [campo]: valor }));
        if (!isMestre) return;
        updateFicha(f => {
            if (!f.hierarquia) f.hierarquia = {};
            f.hierarquia[campo] = valor;
        });
    };

    const salvarHierarquia = (p, i, s) => {
        if (!isMestre) return;
        updateFicha(f => {
            if (!f.hierarquia) f.hierarquia = {};
            f.hierarquia.poder = p;
            f.hierarquia.infinity = i;
            f.hierarquia.singularidade = s;
        });
        callSave();
    };

    const salvarTextosHierarquia = () => {
        if (!isMestre) return;
        updateFicha(f => {
            if (!f.hierarquia) f.hierarquia = {};
            f.hierarquia.poderNome = hTextos.poderNome;
            f.hierarquia.poderDesc = hTextos.poderDesc;
            f.hierarquia.poderVertente = hTextos.poderVertente;
            f.hierarquia.poderElemento = hTextos.poderElemento;
            f.hierarquia.poderAfeta = hTextos.poderAfeta;
            f.hierarquia.infinityNome = hTextos.infinityNome;
            f.hierarquia.infinityDesc = hTextos.infinityDesc;
            f.hierarquia.infinityVertente = hTextos.infinityVertente;
            f.hierarquia.infinityElemento = hTextos.infinityElemento;
            f.hierarquia.infinityAfeta = hTextos.infinityAfeta;
            f.hierarquia.singularidadeNome = hTextos.singularidadeNome;
            f.hierarquia.singularidadeDesc = hTextos.singularidadeDesc;
        });
        callSave();
        setSalvandoClassificacao(true);
        setTimeout(() => setSalvandoClassificacao(false), 2000);
    };

    let tituloSupremo = 'MUNDANO';
    let corSuprema = minhaFicha?.estetica?.corTintaRadar || '#000000';
    let nomeHabilidadeDestaque = '';
    let vertenteDestaque = '';
    let elementoDestaque = ''; 
    let afetaDestaque = '';

    if (hSingularidade === '0') {
        tituloSupremo = 'SINGULARIDADE GRAU 0 (MARCADO)'; corSuprema = '#ff00ff'; nomeHabilidadeDestaque = hTextos.singularidadeNome;
    } else if (hSingularidade === '1') {
        tituloSupremo = 'SINGULARIDADE GRAU 1 (NASCIDA)'; corSuprema = '#ff003c'; nomeHabilidadeDestaque = hTextos.singularidadeNome;
    } else if (hSingularidade === '2') {
        tituloSupremo = 'SINGULARIDADE GRAU 2 (DESENVOLVIDA)'; corSuprema = '#ff8800'; nomeHabilidadeDestaque = hTextos.singularidadeNome;
    } else if (hSingularidade === '3') {
        tituloSupremo = 'SINGULARIDADE GRAU 3 (HERDADA)'; corSuprema = '#ffcc00'; nomeHabilidadeDestaque = hTextos.singularidadeNome;
    } else if (hInfinity) {
        tituloSupremo = 'INFINITY (MANIPULAÇÃO ABSOLUTA)'; corSuprema = '#00ccff'; nomeHabilidadeDestaque = hTextos.infinityNome; vertenteDestaque = hTextos.infinityVertente;
        elementoDestaque = hTextos.infinityElemento; afetaDestaque = hTextos.infinityAfeta;
    } else if (hPoder) {
        tituloSupremo = 'PODER (RESSONÂNCIA NATURAL)'; corSuprema = '#00ffcc'; nomeHabilidadeDestaque = hTextos.poderNome; vertenteDestaque = hTextos.poderVertente;
        elementoDestaque = hTextos.poderElemento; afetaDestaque = hTextos.poderAfeta;
    }

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {!isMestre && (
                <div style={{ border: '2px dashed #f00', padding: '10px', textAlign: 'center', fontWeight: 'bold', color: '#f00', borderRadius: '4px' }}>
                    🔒 MODO LEITURA: Apenas o Mestre pode forjar e alterar a Classificação.
                </div>
            )}

            {/* 👑 BANNER DO GRAU DE CALAMIDADE */}
            <div style={{ textAlign: 'center', padding: '30px', border: `3px double ${corSuprema}`, background: 'rgba(0,0,0,0.03)', borderRadius: '8px', position: 'relative' }}>
                <h2 style={{ fontSize: '1.2em', margin: '0 0 10px 0', letterSpacing: '2px', textTransform: 'uppercase', opacity: 0.8 }}>Grau de Calamidade Atual</h2>
                <div style={{ fontSize: '2.5em', fontWeight: '900', color: corSuprema, textTransform: 'uppercase', letterSpacing: '2px' }}>{tituloSupremo}</div>
                {nomeHabilidadeDestaque && <div style={{ fontSize: '1.8em', fontWeight: 'bold', fontStyle: 'italic', marginTop: '10px' }}>"{nomeHabilidadeDestaque}"</div>}
                
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
                    {vertenteDestaque && <div style={{ padding: '4px 15px', border: `1px dashed ${corSuprema}`, color: corSuprema, borderRadius: '20px', fontSize: '0.85em', fontWeight: 'bold', textTransform: 'uppercase' }}>🎯 Vertente: {vertenteDestaque}</div>}
                    {elementoDestaque && vertenteDestaque === 'Elemental' && <div style={{ padding: '4px 15px', border: `1px dashed ${corSuprema}`, color: corSuprema, borderRadius: '20px', fontSize: '0.85em', fontWeight: 'bold', textTransform: 'uppercase' }}>🌪️ Elemento: {elementoDestaque}</div>}
                    {afetaDestaque && vertenteDestaque === 'Elemental' && <div style={{ padding: '4px 15px', border: `1px dashed ${corSuprema}`, color: corSuprema, borderRadius: '20px', fontSize: '0.85em', fontWeight: 'bold', textTransform: 'uppercase' }}>🌊 Consome: {afetaDestaque}</div>}
                </div>
            </div>

            {/* ✨ CATEGORIA 1: PODER */}
            <div style={{ border: `1px solid ${hPoder ? '#00ffcc' : 'currentColor'}`, padding: '15px', borderRadius: '8px', background: hPoder ? 'rgba(0,255,204,0.05)' : 'transparent', transition: 'all 0.3s' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '15px', cursor: isMestre ? 'pointer' : 'not-allowed' }}>
                    <input type="checkbox" checked={hPoder} onChange={e => salvarHierarquia(e.target.checked, hInfinity, hSingularidade)} disabled={!isMestre} style={{ transform: 'scale(1.5)', margin: '5px' }} />
                    <div>
                        <div style={{ color: hPoder ? '#00ffcc' : 'inherit', fontWeight: 'bold', fontSize: '1.1em' }}>✨ Categoria 1: Poder (Ressonância Natural)</div>
                        <div style={{ fontSize: '0.85em', marginTop: '4px', opacity: 0.8 }}>Habilidade inata que usa as 3 energias para escalar, mas não gasta nenhuma (Custo Zero).</div>
                    </div>
                </label>
                {hPoder && (
                    <div className="fade-in" style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed currentColor' }}>
                        <label style={{ fontSize: '0.85em', fontWeight: 'bold', display: 'block', marginBottom: '5px', opacity: 0.8 }}>Vertente do Poder:</label>
                        <select 
                            value={hTextos.poderVertente} 
                            onChange={e => atualizarTextoHierarquia('poderVertente', e.target.value)}
                            disabled={!isMestre} 
                            style={{ width: '100%', marginBottom: '10px', background: 'transparent', color: 'inherit', border: 'none', borderBottom: '1px dashed currentColor', padding: '8px', outline: 'none', fontFamily: 'inherit' }}
                        >
                            <option value="" style={{ color: '#000' }}>Selecione a Vertente...</option>
                            <option value="Acumulativo" style={{ color: '#000' }}>📈 Acumulativo (Requer Marcadores e Forja)</option>
                            <option value="Elemental" style={{ color: '#000' }}>🌪️ Elemental (Domínio absoluto de forças e natureza)</option>
                            <option value="Conceitual" style={{ color: '#000' }}>🧩 Conceitual (Quebra de regras absolutas e espaço/tempo)</option>
                            <option value="Utilitario" style={{ color: '#000' }}>🛠️ Utilitário (Hackers da realidade, Mimetismo, Anulação)</option>
                        </select>

                        {hTextos.poderVertente === 'Elemental' && (
                            <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                <div>
                                    <label style={{ fontSize: '0.85em', fontWeight: 'bold', opacity: 0.8 }}>Elemento Oficial:</label>
                                    <select value={hTextos.poderElemento} onChange={e => atualizarTextoHierarquia('poderElemento', e.target.value)} disabled={!isMestre} style={{ width: '100%', background: 'transparent', color: 'inherit', border: 'none', borderBottom: '1px dashed currentColor', padding: '8px', outline: 'none', fontFamily: 'inherit' }}>
                                        <option value="" style={{ color: '#000' }}>Selecione a raiz elemental...</option>
                                        {ELEMENTOS_OPCOES.map(grupo => (
                                            <optgroup key={grupo.label} label={grupo.label} style={{ color: '#000' }}>
                                                {grupo.opcoes.map(el => <option key={el} value={el}>{el}</option>)}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.85em', fontWeight: 'bold', opacity: 0.8 }}>Afeta/Consome:</label>
                                    <CampoMagico disabled={!isMestre} valor={hTextos.poderAfeta} onChange={v => atualizarTextoHierarquia('poderAfeta', v)} placeholder="Ex: Gelo, Vento" />
                                </div>
                            </div>
                        )}

                        <CampoMagico disabled={!isMestre} valor={hTextos.poderNome} onChange={v => atualizarTextoHierarquia('poderNome', v)} placeholder="Nome do seu Poder (Ex: Chamas do Purgatório)" styleExtra={{ fontSize: '1.1em', fontWeight: 'bold', marginBottom: '10px' }} />
                        <AreaMagica disabled={!isMestre} valor={hTextos.poderDesc} onChange={v => atualizarTextoHierarquia('poderDesc', v)} placeholder="Descreva como a ressonância da sua habilidade se manifesta na realidade..." />
                    </div>
                )}
            </div>

            {/* 🌌 CATEGORIA 2: INFINITY */}
            <div style={{ border: `1px solid ${hInfinity ? '#00ccff' : 'currentColor'}`, padding: '15px', borderRadius: '8px', background: hInfinity ? 'rgba(0,204,255,0.05)' : 'transparent', transition: 'all 0.3s' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '15px', cursor: isMestre ? 'pointer' : 'not-allowed' }}>
                    <input type="checkbox" checked={hInfinity} onChange={e => salvarHierarquia(hPoder, e.target.checked, hSingularidade)} disabled={!isMestre} style={{ transform: 'scale(1.5)', margin: '5px' }} />
                    <div>
                        <div style={{ color: hInfinity ? '#00ccff' : 'inherit', fontWeight: 'bold', fontSize: '1.1em' }}>🌌 Categoria 2: Infinity (Manipulação Absoluta)</div>
                        <div style={{ fontSize: '0.85em', marginTop: '4px', opacity: 0.8 }}>Controle infinito e conceitual. <strong style={{color: hInfinity ? '#00ccff' : 'inherit'}}>⚠️ Permite Cópia (Mimetismo).</strong></div>
                    </div>
                </label>
                {hInfinity && (
                    <div className="fade-in" style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed currentColor' }}>
                        <label style={{ fontSize: '0.85em', fontWeight: 'bold', display: 'block', marginBottom: '5px', opacity: 0.8 }}>Vertente do Infinity:</label>
                        <select 
                            value={hTextos.infinityVertente} 
                            onChange={e => atualizarTextoHierarquia('infinityVertente', e.target.value)}
                            disabled={!isMestre} 
                            style={{ width: '100%', marginBottom: '10px', background: 'transparent', color: 'inherit', border: 'none', borderBottom: '1px dashed currentColor', padding: '8px', outline: 'none', fontFamily: 'inherit' }}
                        >
                            <option value="" style={{ color: '#000' }}>Selecione a Vertente...</option>
                            <option value="Acumulativo" style={{ color: '#000' }}>📈 Acumulativo (Requer Marcadores e Forja)</option>
                            <option value="Elemental" style={{ color: '#000' }}>🌪️ Elemental (Domínio absoluto de forças e natureza)</option>
                            <option value="Conceitual" style={{ color: '#000' }}>🧩 Conceitual (Quebra de regras absolutas e espaço/tempo)</option>
                            <option value="Utilitario" style={{ color: '#000' }}>🛠️ Utilitário (Hackers da realidade, Mimetismo, Anulação)</option>
                        </select>

                        {hTextos.infinityVertente === 'Elemental' && (
                            <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                <div>
                                    <label style={{ fontSize: '0.85em', fontWeight: 'bold', opacity: 0.8 }}>Elemento Oficial:</label>
                                    <select value={hTextos.infinityElemento} onChange={e => atualizarTextoHierarquia('infinityElemento', e.target.value)} disabled={!isMestre} style={{ width: '100%', background: 'transparent', color: 'inherit', border: 'none', borderBottom: '1px dashed currentColor', padding: '8px', outline: 'none', fontFamily: 'inherit' }}>
                                        <option value="" style={{ color: '#000' }}>Selecione a raiz elemental...</option>
                                        {ELEMENTOS_OPCOES.map(grupo => (
                                            <optgroup key={grupo.label} label={grupo.label} style={{ color: '#000' }}>
                                                {grupo.opcoes.map(el => <option key={el} value={el}>{el}</option>)}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.85em', fontWeight: 'bold', opacity: 0.8 }}>Afeta/Consome:</label>
                                    <CampoMagico disabled={!isMestre} valor={hTextos.infinityAfeta} onChange={v => atualizarTextoHierarquia('infinityAfeta', v)} placeholder="Ex: Fogo, Gelo" />
                                </div>
                            </div>
                        )}

                        <CampoMagico disabled={!isMestre} valor={hTextos.infinityNome} onChange={v => atualizarTextoHierarquia('infinityNome', v)} placeholder="Nome do seu Infinity (Ex: Frio Zero Absoluto)" styleExtra={{ fontSize: '1.1em', fontWeight: 'bold', marginBottom: '10px' }} />
                        <AreaMagica disabled={!isMestre} valor={hTextos.infinityDesc} onChange={v => atualizarTextoHierarquia('infinityDesc', v)} placeholder="Descreva as leis conceituais e limites dessa manipulação infinita..." />
                    </div>
                )}
            </div>

            {/* 👑 CATEGORIA 3: SINGULARIDADE */}
            <div style={{ border: `1px solid ${hSingularidade ? '#ff00ff' : 'currentColor'}`, padding: '15px', borderRadius: '8px', background: hSingularidade ? 'rgba(255,0,255,0.05)' : 'transparent', transition: 'all 0.3s' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '15px', cursor: isMestre ? 'pointer' : 'not-allowed' }}>
                    <input type="checkbox" checked={!!hSingularidade} onChange={e => { const val = e.target.checked ? '3' : ''; salvarHierarquia(hPoder, hInfinity, val); }} disabled={!isMestre} style={{ transform: 'scale(1.5)', margin: '5px' }} />
                    <div>
                        <div style={{ color: hSingularidade ? '#ff00ff' : 'inherit', fontWeight: 'bold', fontSize: '1.1em' }}>👑 Categoria 3: Singularidade (Anomalia Máxima)</div>
                        <div style={{ fontSize: '0.85em', marginTop: '4px', opacity: 0.8 }}>Uma falha na própria realidade. <strong style={{color: hSingularidade ? '#ff00ff' : 'inherit'}}>🚫 REGRA ABSOLUTA: Impossível ser copiada.</strong></div>
                    </div>
                </label>
                {hSingularidade && (
                    <div className="fade-in" style={{ marginTop: '15px', paddingLeft: '20px', borderLeft: '2px dashed currentColor' }}>
                        <label style={{ fontSize: '0.9em', fontWeight: 'bold', opacity: 0.8 }}>Selecione o Grau da sua Singularidade:</label>
                        <select 
                            value={hSingularidade} 
                            onChange={e => salvarHierarquia(hPoder, hInfinity, e.target.value)} 
                            disabled={!isMestre}
                            style={{ width: '100%', marginTop: '8px', marginBottom: '15px', background: 'transparent', color: 'inherit', border: 'none', borderBottom: '1px dashed currentColor', padding: '8px', outline: 'none', fontFamily: 'inherit' }}
                        >
                            <option value="3" style={{ color: '#000' }}>Grau 3: Herdada (Poder transferido ou roubado)</option>
                            <option value="2" style={{ color: '#000' }}>Grau 2: Desenvolvida (Evoluída além do limite de um Poder/Infinity)</option>
                            <option value="1" style={{ color: '#000' }}>Grau 1: Nascida (Anomalia inata desde o berço)</option>
                            <option value="0" style={{ color: '#000' }}>Grau 0: Marcado Nascido (O próprio Marcado já nasce como Singularidade)</option>
                        </select>

                        <div style={{ paddingTop: '15px', borderTop: '1px dashed currentColor' }}>
                            <CampoMagico disabled={!isMestre} valor={hTextos.singularidadeNome} onChange={v => atualizarTextoHierarquia('singularidadeNome', v)} placeholder="Nome da Singularidade (Ex: All For One)" styleExtra={{ fontSize: '1.1em', fontWeight: 'bold', marginBottom: '10px' }} />
                            <AreaMagica disabled={!isMestre} valor={hTextos.singularidadeDesc} onChange={v => atualizarTextoHierarquia('singularidadeDesc', v)} placeholder="Descreva como essa anomalia cósmica quebra as regras do universo..." />
                        </div>
                    </div>
                )}
            </div>

            {isMestre && (
                <button onClick={salvarTextosHierarquia} style={{ marginTop: '10px', width: '100%', padding: '12px', fontSize: '1.1em', fontWeight: 'bold', background: 'transparent', border: '2px solid currentColor', color: 'inherit', cursor: 'pointer' }}>
                    {salvandoClassificacao ? '✅ REGISTROS MÍSTICOS SALVOS!' : '💾 SALVAR CLASSIFICAÇÃO NA ALMA'}
                </button>
            )}
        </div>
    );
}

// ==========================================
// ⚖️ CAPÍTULO 2: MARCADORES DE CENA E ADAPTAÇÃO
// ==========================================
function PaginaMarcadores() {
    const { minhaFicha, updateFicha, callSave, novoTrackerNome, setNovoTrackerNome, novoTrackerValor, setNovoTrackerValor } = useClassificacao();
    const corSuprema = minhaFicha?.estetica?.corTintaRadar || '#000000';

    // Lógica dos Marcadores Padrão
    const addMarcador = () => {
        if (!novoTrackerNome.trim() || !novoTrackerValor) return;
        updateFicha(f => {
            if (!f.marcadores) f.marcadores = [];
            f.marcadores.push({ nome: novoTrackerNome.trim(), bonus: Number(novoTrackerValor), stacks: 1 });
        });
        setNovoTrackerNome(''); setNovoTrackerValor(''); callSave();
    };

    const updateStack = (index, delta) => {
        updateFicha(f => {
            if (!f.marcadores) return;
            f.marcadores[index].stacks = Math.max(0, f.marcadores[index].stacks + delta);
        });
        callSave();
    };

    const resetCena = () => {
        if (!window.confirm("Apagar todos os marcadores desta cena e esvaziar o Tanque de Absorção?")) return;
        updateFicha(f => {
            f.marcadores = [];
            if(f.combate) f.combate.danoAbsorvido = 0;
        });
        callSave();
    };

    // LÓGICA DO NOVO REATOR DE ADAPTAÇÃO (DANO SOFRIDO) & EVOLUÇÃO (COFRE)
    const danoAbsorvido = minhaFicha?.combate?.danoAbsorvido || 0;
    const conversaoAlvo = minhaFicha?.combate?.conversaoAlvo || 10000;
    const conversaoBonus = minhaFicha?.combate?.conversaoBonus || 1;
    const danoTotalRecebido = minhaFicha?.combate?.danoTotalRecebido || 0;
    const letalidadeTotalRecebida = minhaFicha?.combate?.letalidadeTotalRecebida || 0;

    const [danoTomadoInput, setDanoTomadoInput] = useState('');
    const [letalidadeInput, setLetalidadeInput] = useState('');

    const registrarDanoSofrido = () => {
        const val = Number(danoTomadoInput);
        if (isNaN(val) || val <= 0) return;
        updateFicha(f => {
            if (!f.combate) f.combate = {};
            f.combate.danoAbsorvido = (Number(f.combate.danoAbsorvido) || 0) + val;
            f.combate.danoTotalRecebido = (Number(f.combate.danoTotalRecebido) || 0) + val; // Conta para evolução pós-luta
        });
        setDanoTomadoInput(''); callSave();
    };

    const registrarLetalidade = () => {
        const val = Number(letalidadeInput);
        if (isNaN(val) || val <= 0) return;
        updateFicha(f => {
            if (!f.combate) f.combate = {};
            f.combate.letalidadeTotalRecebida = (Number(f.combate.letalidadeTotalRecebida) || 0) + val;
        });
        setLetalidadeInput(''); callSave();
    };

    // Calcula os pacotes de conversão para a Habilidade de Adaptação
    const pacotesAcumulados = Math.floor(danoAbsorvido / (conversaoAlvo > 0 ? conversaoAlvo : 1));
    const bonusCalculadoMult = pacotesAcumulados * conversaoBonus; 
    const multiplicadorUnicoFormatado = (1 + (bonusCalculadoMult / 100)).toFixed(2); 

    const injetarBuffAdaptação = () => {
        if (bonusCalculadoMult <= 0) return alert("Não há bônus acumulado suficiente no tanque para injetar!");
        updateFicha(f => {
            if (!f.dano) f.dano = {};
            const novoValorStr = String(multiplicadorUnicoFormatado);
            if (!f.dano.mUnico || f.dano.mUnico === '1.0' || f.dano.mUnico === '1') {
                f.dano.mUnico = novoValorStr;
            } else {
                f.dano.mUnico = f.dano.mUnico + ',' + novoValorStr;
            }
        });
        callSave();
        alert(`Adaptação Concluída! Multiplicador Único de x${multiplicadorUnicoFormatado} injetado na sua Ficha!`);
    };

    const resetarEvolucao = () => {
        if (!window.confirm("Atenção! Isso vai zerar o seu Cofre de Evolução (Dano e Letalidade guardados). Só faça isso APÓS gastar os seus pontos de prestígio. Continuar?")) return;
        updateFicha(f => {
            if (f.combate) {
                f.combate.danoTotalRecebido = 0;
                f.combate.letalidadeTotalRecebida = 0;
            }
        });
        callSave();
    };

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            {/* ⚖️ BALANÇA DE ADAPTAÇÃO (TANQUE DA CENA) */}
            <div style={{ border: '2px double currentColor', padding: '20px', borderRadius: '8px', background: 'rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px dotted currentColor', paddingBottom: '10px', position: 'relative', zIndex: 1 }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.4em', display: 'flex', alignItems: 'center', gap: '10px', color: '#00ffcc' }}>⚖️ Balança de Adaptação (Batalha Atual)</h2>
                        <span style={{ fontSize: '0.85em', opacity: 0.8, fontStyle: 'italic' }}>Absorva o dano sofrido na luta e converta a dor num Multiplicador Único de Dano.</span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '15px', background: 'rgba(0,0,0,0.03)', padding: '10px', borderRadius: '6px', border: '1px dashed #00ffcc', position: 'relative', zIndex: 1 }}>
                    <div style={{ flex: '1 1 200px' }}>
                        <span style={{ fontSize: '0.8em', fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.7, color: '#00ffcc' }}>A cada (X) Dano Sofrido...</span>
                        <CampoMagico valor={conversaoAlvo} onChange={v => { updateFicha(f => { if(!f.combate) f.combate={}; f.combate.conversaoAlvo = Number(v); }); callSave(); }} type="number" styleExtra={{ fontSize: '1.1em', fontWeight: 'bold', borderBottomColor: '#00ffcc', color: '#00ffcc' }} />
                    </div>
                    <div style={{ flex: '1 1 200px' }}>
                        <span style={{ fontSize: '0.8em', fontWeight: 'bold', textTransform: 'uppercase', opacity: 0.7, color: '#00ffcc' }}>...Ganha (%) de Buff Único</span>
                        <CampoMagico valor={conversaoBonus} onChange={v => { updateFicha(f => { if(!f.combate) f.combate={}; f.combate.conversaoBonus = Number(v); }); callSave(); }} type="number" styleExtra={{ fontSize: '1.1em', fontWeight: 'bold', borderBottomColor: '#00ffcc', color: '#00ffcc' }} />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '20px', alignItems: 'stretch', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
                    <div style={{ flex: '1 1 250px', background: 'rgba(255, 0, 60, 0.05)', border: '1px solid #ff003c', borderRadius: '6px', padding: '15px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <span style={{ fontSize: '0.85em', color: '#ff003c', fontWeight: 'bold', textTransform: 'uppercase' }}>Ferimento (Dano Tomado Neste Turno):</span>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                            <CampoMagico valor={danoTomadoInput} onChange={setDanoTomadoInput} placeholder="Ex: 500000" type="number" styleExtra={{ borderBottom: '1px solid #ff003c', color: '#ff003c', fontSize: '1.2em' }} />
                            <button onClick={registrarDanoSofrido} style={{ padding: '8px 15px', background: 'transparent', border: '1px solid #ff003c', color: '#ff003c', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>ABSORVER</button>
                        </div>
                        <button onClick={() => { updateFicha(f => { if(f.combate) f.combate.danoAbsorvido = 0; }); callSave(); }} style={{ marginTop: '10px', background: 'transparent', border: 'none', color: '#ff003c', fontSize: '0.8em', cursor: 'pointer', opacity: 0.8, textDecoration: 'underline' }}>Esvaziar Tanque da Cena</button>
                    </div>

                    <div style={{ flex: '1 1 250px', background: 'rgba(0, 255, 204, 0.05)', border: '1px solid #00ffcc', borderRadius: '6px', padding: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                        <span style={{ fontSize: '0.85em', color: '#00ffcc', fontWeight: 'bold', textTransform: 'uppercase' }}>Tanque de Absorção Atual</span>
                        <span style={{ fontSize: '2em', fontWeight: '900', color: '#00ffcc', textShadow: '0 0 10px rgba(0,255,204,0.5)' }}>{Number(danoAbsorvido).toLocaleString('pt-BR')}</span>
                        
                        <div style={{ marginTop: '10px', borderTop: '1px dashed #00ffcc', paddingTop: '10px', width: '100%' }}>
                            <span style={{ fontSize: '0.85em', color: '#aaa' }}>Buff Multiplicador Convertido:</span>
                            <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: 'inherit' }}>+{bonusCalculadoMult}% <span style={{fontSize: '0.6em', opacity: 0.6}}>(x{multiplicadorUnicoFormatado})</span></div>
                        </div>

                        <button onClick={injetarBuffAdaptação} style={{ marginTop: '10px', width: '100%', padding: '8px', background: 'transparent', border: '1px solid #00ffcc', color: '#00ffcc', fontWeight: 'bold', cursor: 'pointer', borderRadius: '4px', transition: '0.2s' }}>
                            ⚡ INJETAR BÔNUS MULT. ÚNICO
                        </button>
                    </div>
                </div>
            </div>

            {/* 🩸 COFRE DE FERIMENTOS (PARA UPAR PÓS LUTA) */}
            <div style={{ border: '2px solid #ff003c', padding: '20px', borderRadius: '8px', background: 'rgba(255,0,60,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px dotted #ff003c', paddingBottom: '10px' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.4em', display: 'flex', alignItems: 'center', gap: '10px', color: '#ff003c' }}>🩸 Cofre de Evolução (Pós-Combate)</h2>
                        <span style={{ fontSize: '0.85em', opacity: 0.8, fontStyle: 'italic', color: '#ffaaaa' }}>O dano absorvido acima entra aqui automaticamente. Registe a letalidade manualmente.</span>
                    </div>
                    <button onClick={resetarEvolucao} style={{ padding: '8px 15px', border: '1px solid #ff003c', color: '#ff003c', background: 'transparent', cursor: 'pointer', opacity: 0.8, borderRadius: '4px' }}>🧹 Zerar Cofre</button>
                </div>

                <div style={{ display: 'flex', gap: '20px', alignItems: 'stretch', flexWrap: 'wrap' }}>
                    {/* Input de Letalidade */}
                    <div style={{ flex: '1 1 200px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '15px', display: 'flex', flexDirection: 'column', justifyContent: 'center', border: '1px dashed #ff003c' }}>
                        <span style={{ fontSize: '0.85em', color: '#ff003c', fontWeight: 'bold', textTransform: 'uppercase' }}>Sofreu Golpe Letal? (Registe):</span>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                            <CampoMagico valor={letalidadeInput} onChange={setLetalidadeInput} placeholder="Ex: 50" type="number" styleExtra={{ borderBottom: '1px solid #ff003c', color: '#ff003c', fontSize: '1.2em' }} />
                            <button onClick={registrarLetalidade} style={{ padding: '8px 15px', background: 'transparent', border: '1px solid #ff003c', color: '#ff003c', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>+ REGISTRAR</button>
                        </div>
                    </div>

                    {/* Mostrador do Cofre */}
                    <div style={{ flex: '2 1 300px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '6px', padding: '15px', textAlign: 'center', border: '1px solid #555' }}>
                            <div style={{ fontSize: '0.85em', color: '#aaa', textTransform: 'uppercase', marginBottom: '5px' }}>Total de Dano Histórico</div>
                            <div style={{ fontSize: '1.8em', fontWeight: 'bold', color: '#ffcc00' }}>{Number(danoTotalRecebido).toLocaleString('pt-BR')}</div>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '6px', padding: '15px', textAlign: 'center', border: '1px solid #555' }}>
                            <div style={{ fontSize: '0.85em', color: '#aaa', textTransform: 'uppercase', marginBottom: '5px' }}>Letalidade Acumulada</div>
                            <div style={{ fontSize: '1.8em', fontWeight: 'bold', color: '#ff00ff' }}>{Number(letalidadeTotalRecebida).toLocaleString('pt-BR')}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ⚔️ MARCADORES DE CENA (BUFFS POR TURNO) */}
            <div style={{ border: '2px solid currentColor', padding: '20px', borderRadius: '8px', background: 'rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px dotted currentColor', paddingBottom: '10px' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.4em', display: 'flex', alignItems: 'center', gap: '10px' }}>⚔️ Stacks por Turno (Marcadores Livres)</h2>
                        <span style={{ fontSize: '0.85em', opacity: 0.7, fontStyle: 'italic' }}>Ex: "A cada turno recebe +8 de Acerto". Valor final para somar nos dados.</span>
                    </div>
                    <button onClick={resetCena} style={{ padding: '8px 15px', border: '1px solid currentColor', color: 'inherit', background: 'transparent', cursor: 'pointer', opacity: 0.8, borderRadius: '4px' }}>🧹 Limpar Todos</button>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    <CampoMagico valor={novoTrackerNome} onChange={setNovoTrackerNome} placeholder="Nome (Ex: Acerto, CA...)" styleExtra={{ flex: 2, border: '1px dashed currentColor' }} />
                    <CampoMagico valor={novoTrackerValor} onChange={setNovoTrackerValor} placeholder="Bônus por Stack (Ex: 8)" type="number" styleExtra={{ flex: 1, border: '1px dashed currentColor', textAlign: 'center' }} />
                    <button onClick={addMarcador} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid currentColor', color: 'inherit', cursor: 'pointer', fontWeight: 'bold', borderRadius: '4px' }}>+ Inscrever</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(!minhaFicha.marcadores || minhaFicha.marcadores.length === 0) ? (
                        <div style={{ textAlign: 'center', opacity: 0.5, fontStyle: 'italic', padding: '10px' }}>Nenhum marcador ativo.</div>
                    ) : (
                        minhaFicha.marcadores.map((m, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.05)', padding: '10px 15px', borderRadius: '6px', borderLeft: '3px solid currentColor' }}>
                                <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>{m.nome}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ fontSize: '1em', opacity: 0.8 }}>(+{m.bonus}/stack)</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.05)', padding: '5px 10px', borderRadius: '20px', border: '1px dotted currentColor' }}>
                                        <button onClick={() => updateStack(i, -1)} style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: '1.2em', cursor: 'pointer' }}>-</button>
                                        <span style={{ fontSize: '1.2em', fontWeight: 'bold', minWidth: '20px', textAlign: 'center' }}>{m.stacks}</span>
                                        <button onClick={() => updateStack(i, 1)} style={{ background: 'transparent', border: 'none', color: 'inherit', fontSize: '1.2em', cursor: 'pointer' }}>+</button>
                                    </div>
                                    <div style={{ fontSize: '1.4em', fontWeight: 'bold', width: '80px', textAlign: 'right', color: corSuprema }}>= +{m.stacks * m.bonus}</div>
                                    <button onClick={() => { updateFicha(f => f.marcadores.splice(i,1)); callSave(); }} style={{ padding: '5px', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.5 }}>✖</button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

// ==========================================
// 🌌 CAPÍTULO 3: FORJA DE CALAMIDADE
// ==========================================
function PaginaForja() {
    const { updateFicha, callSave, forja, setForja, forjaValor, setForjaValor } = useClassificacao();

    const injetarForja = () => {
        const val = Number(forjaValor);
        if (isNaN(val) || val === 0) return alert("A Forja exige um valor numérico válido.");
        if (!window.confirm(`Fundir +${val} aos atributos selecionados permanentemente?`)) return;

        updateFicha(f => {
            if (forja.vida) { f.vida = f.vida || {}; f.vida.base = (Number(f.vida.base) || 0) + val; }
            if (forja.energias) { ['mana', 'aura', 'chakra', 'corpo'].forEach(k => { f[k] = f[k] || {}; f[k].base = (Number(f[k].base) || 0) + val; }); }
            if (forja.status) { ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'].forEach(k => { f[k] = f[k] || {}; f[k].base = (Number(f[k].base) || 0) + val; }); }
            if (forja.multGeral) { f.dano = f.dano || {}; f.dano.mGeral = (Number(f.dano.mGeral) || 1) + val; }
            if (forja.danoBruto) { f.dano = f.dano || {}; f.dano.danoBruto = (Number(f.dano.danoBruto) || 0) + val; }
        });
        setForjaValor(''); callSave(); alert("Evolução Injetada na Alma!");
    };

    return (
        <div className="fade-in" style={{ border: '2px double currentColor', padding: '20px', borderRadius: '8px', background: 'rgba(0,0,0,0.05)' }}>
            <div style={{ marginBottom: '15px', borderBottom: '1px dotted currentColor', paddingBottom: '10px' }}>
                <span style={{ fontSize: '0.9em', opacity: 0.7, fontStyle: 'italic' }}>Calcule os ganhos absolutos que o seu Infinity ou Singularidade processou e funda-os na alma.</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px', padding: '15px', border: '1px dashed currentColor', borderRadius: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold' }}>
                    <input type="checkbox" checked={forja.vida} onChange={e => setForja({...forja, vida: e.target.checked})} style={{ transform: 'scale(1.2)' }}/> Vida Máxima Base
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold' }}>
                    <input type="checkbox" checked={forja.energias} onChange={e => setForja({...forja, energias: e.target.checked})} style={{ transform: 'scale(1.2)' }}/> Energias Base
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold' }}>
                    <input type="checkbox" checked={forja.status} onChange={e => setForja({...forja, status: e.target.checked})} style={{ transform: 'scale(1.2)' }}/> Status Base
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold' }}>
                    <input type="checkbox" checked={forja.danoBruto} onChange={e => setForja({...forja, danoBruto: e.target.checked})} style={{ transform: 'scale(1.2)' }}/> Dano Bruto Flat (+)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold', gridColumn: 'span 2' }}>
                    <input type="checkbox" checked={forja.multGeral} onChange={e => setForja({...forja, multGeral: e.target.checked})} style={{ transform: 'scale(1.2)' }}/> Multiplicador Geral de Dano (x)
                </label>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
                <CampoMagico valor={forjaValor} onChange={setForjaValor} placeholder="Valor da Evolução (Ex: 25000)" type="number" styleExtra={{ flex: 1, border: '2px dashed currentColor', fontSize: '1.2em', textAlign: 'center' }} />
                <button onClick={injetarForja} style={{ flex: 2, padding: '15px', background: 'transparent', color: 'inherit', border: '2px solid currentColor', borderRadius: '4px', fontSize: '1.2em', fontWeight: 'bold', textTransform: 'uppercase', cursor: 'pointer' }}>
                    ⚡ Injetar Evolução
                </button>
            </div>
        </div>
    );
}

function PaginaReator() {
    const { minhaFicha } = useClassificacao();
    const getAtual = (k) => { const max = getMaximo(minhaFicha, k); return minhaFicha?.[k]?.atual !== undefined ? minhaFicha[k].atual : max; };
    const soma = getAtual('mana') + getAtual('aura') + getAtual('chakra');

    return (
        <div className="fade-in" style={{ border: '2px solid currentColor', padding: '30px', borderRadius: '8px', background: 'rgba(0,0,0,0.02)', textAlign: 'center' }}>
            <p style={{ opacity: 0.8, fontStyle: 'italic', marginBottom: '20px' }}>A força bruta da natureza funde as suas energias passivamente para as suas habilidades Elementais.</p>
            <div style={{ fontSize: '1.4em', fontWeight: 'bold', marginBottom: '10px' }}>Soma das Energias (Mana + Aura + Chakra)</div>
            <div style={{ fontSize: '3em', fontWeight: '900', borderBottom: '3px double currentColor', display: 'inline-block', padding: '0 20px' }}>
                +{soma} <span style={{ fontSize: '0.4em', opacity: 0.6, fontWeight: 'normal' }}>Dano Flat Estimado</span>
            </div>
        </div>
    );
}

function PaginaConceitual() {
    const { minhaFicha, updateFicha, callSave, novaLeiNome, setNovaLeiNome } = useClassificacao();
    const leis = minhaFicha?.combate?.leis || [];

    const addLei = () => {
        if (!novaLeiNome.trim()) return;
        updateFicha(f => { if (!f.combate) f.combate = {}; if (!f.combate.leis) f.combate.leis = []; f.combate.leis.push({ id: Date.now(), texto: novaLeiNome }); });
        callSave(); setNovaLeiNome('');
    };

    return (
        <div className="fade-in" style={{ border: '1px dashed currentColor', padding: '20px', borderRadius: '8px', background: 'rgba(0,0,0,0.02)' }}>
            <p style={{ opacity: 0.8, fontStyle: 'italic', marginBottom: '20px' }}>Anomalias conceituais reescrevem as leis da realidade. Decrete as "Leis da Cena" em vigor.</p>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '20px' }}>
                <CampoMagico valor={novaLeiNome} onChange={setNovaLeiNome} placeholder="Decrete uma nova Lei (Ex: Ninguém pode esquivar)..." styleExtra={{ flex: 1, fontSize: '1.1em', padding: '10px' }} />
                <button onClick={addLei} style={{ background: 'transparent', border: '1px solid currentColor', color: 'inherit', padding: '10px 20px', fontSize: '1.1em', fontWeight: 'bold', cursor: 'pointer' }}>+ DECRETAR</button>
            </div>
            {leis.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {leis.map(lei => (
                        <div key={lei.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.05)', padding: '10px 15px', borderRadius: '5px', borderLeft: '3px solid currentColor' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '1.1em', fontStyle: 'italic' }}>"{lei.texto}"</div>
                            <button onClick={() => { updateFicha(f => { f.combate.leis = f.combate.leis.filter(x => x.id !== lei.id); }); callSave(); }} style={{ background: 'transparent', border: 'none', color: 'inherit', opacity: 0.6, cursor: 'pointer', fontWeight: 'bold' }}>REVOGAR</button>
                        </div>
                    ))}
                </div>
            ) : ( <div style={{ opacity: 0.5, fontStyle: 'italic', textAlign: 'center' }}>Nenhuma lei em vigor.</div> )}
        </div>
    );
}

function PaginaUtilitaria() {
    const { minhaFicha, updateFicha, callSave, novaCopiaNome, setNovaCopiaNome, novaCopiaEfeito, setNovaCopiaEfeito } = useClassificacao();
    const copias = minhaFicha?.combate?.copias || [];

    const addCopia = () => {
        if (!novaCopiaNome.trim()) return;
        updateFicha(f => { if (!f.combate) f.combate = {}; if (!f.combate.copias) f.combate.copias = []; f.combate.copias.push({ id: Date.now(), nome: novaCopiaNome, efeito: novaCopiaEfeito }); });
        callSave(); setNovaCopiaNome(''); setNovaCopiaEfeito('');
    };

    return (
        <div className="fade-in" style={{ border: '1px dashed currentColor', padding: '20px', borderRadius: '8px', background: 'rgba(0,0,0,0.02)' }}>
            <p style={{ opacity: 0.8, fontStyle: 'italic', marginBottom: '20px' }}>Para Infinities de Cópia (ex: Ketsuda). Registe as habilidades ou buffs copiados temporariamente.</p>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
                <CampoMagico valor={novaCopiaNome} onChange={setNovaCopiaNome} placeholder="Nome do Poder Copiado" styleExtra={{ flex: '1 1 200px', fontSize: '1.1em', padding: '10px' }} />
                <CampoMagico valor={novaCopiaEfeito} onChange={setNovaCopiaEfeito} placeholder="Efeito Copiado" styleExtra={{ flex: '1 1 200px', fontSize: '1.1em', padding: '10px' }} />
                <button onClick={addCopia} style={{ background: 'transparent', border: '1px solid currentColor', color: 'inherit', padding: '10px 20px', fontSize: '1.1em', fontWeight: 'bold', cursor: 'pointer' }}>+ ARMAZENAR</button>
            </div>
            {copias.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px' }}>
                    {copias.map(c => (
                        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.05)', padding: '10px', borderRadius: '5px', borderLeft: '3px solid currentColor' }}>
                            <div><div style={{ fontWeight: 'bold' }}>{c.nome}</div><div style={{ fontSize: '0.85em', opacity: 0.8, marginTop: '2px' }}>{c.efeito}</div></div>
                            <button onClick={() => { updateFicha(f => { f.combate.copias = f.combate.copias.filter(x => x.id !== c.id); }); callSave(); }} style={{ background: 'transparent', border: 'none', color: 'inherit', opacity: 0.6, cursor: 'pointer', fontWeight: 'bold' }}>✖</button>
                        </div>
                    ))}
                </div>
            ) : ( <div style={{ opacity: 0.5, fontStyle: 'italic', textAlign: 'center' }}>Matriz vazia. Nenhuma cópia ativa.</div> )}
        </div>
    );
}

// ==========================================
// 🚀 O RENDERIZADOR PRINCIPAL DO LIVRO
// ==========================================
export default function ClassificacaoPanel() {
    return (
        <ClassificacaoProvider>
            <div className="grimorio-estilo-papel" style={{ width: '100%' }}>
                <ClassificacaoNavegacao />
                <ConteudoDinamico />
            </div>
        </ClassificacaoProvider>
    );
}

function ConteudoDinamico() {
    const { abaAtual } = useClassificacao();
    if (abaAtual === 'registros') return <PaginaRegistros />;
    if (abaAtual === 'acumulativo') return <PaginaMarcadores />;
    if (abaAtual === 'forja') return <PaginaForja />;
    if (abaAtual === 'elemental') return <PaginaReator />;
    if (abaAtual === 'conceitual') return <PaginaConceitual />;
    if (abaAtual === 'utilitario') return <PaginaUtilitaria />;
    return null;
}